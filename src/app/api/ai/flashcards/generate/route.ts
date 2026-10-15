// src/app/api/ai/flashcards/generate/route.ts
//
// POST: generate a flashcard deck for a lesson.
// Auth: teacher of the lesson's class (admin allowed).
//
// Accepts either:
//   - multipart/form-data: lessonId, desiredCount, title, files[] (0-5 PDF/DOCX)
//   - application/json:    { lessonId, desiredCount, title }  (lesson text only)
//
// Source material:
//   - If files are uploaded, cards are generated from the files (plus the
//     lesson body as extra context when it has real content).
//   - If no files, the lesson body must have substantive content.
//
// Flow: auth → parse → role → lesson (RLS) → rate limit → pre-flight →
//       upload files to Gemini → generate → validate → audit row → persist
//       deck + cards → log usage.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/client';
import {
  uploadFilesToGemini,
  buildPartsWithFiles,
} from '@/lib/ai/uploadFile';
import { assertWithinRateLimit } from '@/lib/ai/rate-limit';
import { logUsage } from '@/lib/ai/log';
import { AIError, AIErrors } from '@/lib/ai/errors';
import {
  FLASHCARD_GENERATOR_SYSTEM_INSTRUCTION,
  FLASHCARD_GENERATOR_RESPONSE_SCHEMA,
  buildFlashcardGeneratorUserPrompt,
  validateFlashcardDraft,
  type FlashcardGeneratorDraft,
} from '@/lib/ai/prompts/flashcardGenerator';
import { createFlashcardDeckWithCards } from '@/lib/actions/flashcards';

export const runtime = 'nodejs';

const MAX_FILES = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const MIN_LESSON_CHARS = 100;

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function resolveMime(file: File): string | null {
  if (file.type && ALLOWED_MIME.has(file.type)) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}

type ParsedRequest = {
  lessonId?: string;
  desiredCount?: unknown;
  title?: string;
  files: File[];
};

async function parseRequest(req: NextRequest): Promise<ParsedRequest> {
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    return {
      lessonId: (form.get('lessonId') as string | null) ?? undefined,
      desiredCount: form.get('desiredCount'),
      title: (form.get('title') as string | null) ?? undefined,
      files: form
        .getAll('files')
        .filter((f): f is File => f instanceof File && f.size > 0),
    };
  }
  const body = (await req.json()) as {
    lessonId?: string;
    desiredCount?: number;
    title?: string;
  };
  return { ...body, files: [] };
}

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    console.error('[ai/flashcards] UNHANDLED:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Server error: ${err.message}`
            : 'Unknown server error.',
      },
      { status: 500 },
    );
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();

  // 1. Auth
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    const e = AIErrors.unauthorized();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 2. Parse body (multipart or JSON)
  let parsed: ParsedRequest;
  try {
    parsed = await parseRequest(req);
  } catch {
    const e = AIErrors.badInput('invalid request body');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  const lessonId = parsed.lessonId?.trim();
  if (!lessonId) {
    const e = AIErrors.badInput('lessonId is required');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  const rawCount = Number(parsed.desiredCount);
  const desiredCount = Math.min(
    20,
    Math.max(3, Number.isFinite(rawCount) ? Math.round(rawCount) : 10),
  );
  const deckTitle = (parsed.title ?? '').trim() || 'Flashcards';
  const files = parsed.files;

  // 2b. File validation
  if (files.length > MAX_FILES) {
    const e = AIErrors.badInput(`at most ${MAX_FILES} files allowed`);
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  type Prepared = { data: Blob; mimeType: string; displayName: string };
  const prepared: Prepared[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      const e = AIErrors.badInput(`${file.name} is too large (max 20 MB per file)`);
      return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
    }
    const mime = resolveMime(file);
    if (!mime) {
      const e = AIErrors.badInput(`${file.name}: only PDF and DOCX files are supported`);
      return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
    }
    prepared.push({ data: file, mimeType: mime, displayName: file.name });
  }

  // 3. Role check
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || (profile.role !== 'teacher' && profile.role !== 'admin')) {
    const e = AIErrors.forbidden();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 4. Fetch lesson via RLS-gated query
  const { data: lessonRow, error: lessonErr } = await supabase
    .from('module_lessons')
    .select('id, title, body, module_id, class_modules!inner(class_id)')
    .eq('id', lessonId)
    .single();

  if (lessonErr || !lessonRow) {
    return NextResponse.json(
      { error: 'Lesson not found or you do not have access.' },
      { status: 404 },
    );
  }

  const lesson = lessonRow as unknown as {
    id: string;
    title: string;
    body: string | null;
    module_id: string;
    class_modules: { class_id: string } | { class_id: string }[];
  };
  const classId = Array.isArray(lesson.class_modules)
    ? lesson.class_modules[0]?.class_id
    : lesson.class_modules?.class_id;

  // 5. Pre-flight: need files OR substantive lesson text
  const bodyText = (lesson.body || '').trim();
  const hasLessonText = bodyText.length >= MIN_LESSON_CHARS;
  if (prepared.length === 0 && !hasLessonText) {
    return NextResponse.json(
      {
        error:
          'This lesson has too little content. Upload a PDF or DOCX file, or add more lesson content first.',
      },
      { status: 422 },
    );
  }

  // 6. Rate limit
  try {
    await assertWithinRateLimit(supabase, user.id);
  } catch (err) {
    if (err instanceof AIError) {
      await logUsage(supabase, {
        userId: user.id,
        feature: 'flashcards',
        status: 'rate_limited',
      });
      return NextResponse.json({ error: err.userMessage }, { status: err.statusCode });
    }
    throw err;
  }

  // 7. Upload files to Gemini (if any)
  let uploaded: Awaited<ReturnType<typeof uploadFilesToGemini>> = [];
  if (prepared.length > 0) {
    try {
      uploaded = await uploadFilesToGemini(prepared);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ai/flashcards] upload failed:', message);
      await logUsage(supabase, {
        userId: user.id,
        feature: 'flashcards',
        status: 'error',
        errorMessage: message,
      });
      const status = err instanceof AIError ? err.statusCode : 500;
      const userMsg =
        err instanceof AIError ? err.userMessage : 'File upload to AI failed.';
      return NextResponse.json({ error: userMsg }, { status });
    }
  }

  // 8. Call Gemini
  let draft: FlashcardGeneratorDraft;
  let modelUsed = '';
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const textPrompt = buildFlashcardGeneratorUserPrompt({
      lessonTitle: lesson.title,
      lessonBody: hasLessonText ? bodyText : '',
      desiredCount,
      sourceFileNames: prepared.map((p) => p.displayName),
    });

    const result = await generateText({
      model: 'fast',
      systemInstruction: FLASHCARD_GENERATOR_SYSTEM_INSTRUCTION,
      prompt:
        uploaded.length > 0
          ? buildPartsWithFiles(uploaded, textPrompt)
          : textPrompt,
      responseSchema: FLASHCARD_GENERATOR_RESPONSE_SCHEMA as unknown as Record<
        string,
        unknown
      >,
      temperature: 0.5,
    });
    modelUsed = result.modelUsed;
    tokensIn = result.tokens.input;
    tokensOut = result.tokens.output;

    let raw: unknown;
    try {
      raw = JSON.parse(result.text);
    } catch {
      throw AIErrors.geminiFailed('model returned non-JSON output');
    }
    draft = validateFlashcardDraft(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ai/flashcards] generation failed:', message);
    await logUsage(supabase, {
      userId: user.id,
      feature: 'flashcards',
      model: modelUsed || undefined,
      inputTokens: tokensIn || undefined,
      outputTokens: tokensOut || undefined,
      status: 'error',
      errorMessage: message,
    });
    const status = err instanceof AIError ? err.statusCode : 500;
    const userMsg =
      err instanceof AIError
        ? err.userMessage
        : 'Failed to generate flashcards. Please try again.';
    return NextResponse.json({ error: userMsg }, { status });
  }

  // 9. Handle AI decline gracefully
  if (draft.errorMessage) {
    await logUsage(supabase, {
      userId: user.id,
      feature: 'flashcards',
      model: modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: 'success',
    });
    return NextResponse.json({
      ok: false,
      errorMessage: draft.errorMessage,
      tokens: { input: tokensIn, output: tokensOut },
    });
  }

  // 10. Insert ai_generations row (audit)
  const { data: gen, error: genErr } = await supabase
    .from('ai_generations')
    .insert({
      teacher_id: user.id,
      class_id: classId,
      feature: 'flashcards',
      status: 'draft',
      input_params: {
        lessonId,
        lessonTitle: lesson.title,
        desiredCount,
        deckTitle,
        usedLessonText: hasLessonText,
        sourceFileNames: prepared.map((p) => p.displayName),
      },
      raw_output: draft as unknown as Record<string, unknown>,
      source_file_refs: uploaded.map((u) => u.fileUri),
      model_used: modelUsed,
      tokens_used: tokensIn + tokensOut,
    })
    .select('id')
    .single();

  if (genErr || !gen) {
    await logUsage(supabase, {
      userId: user.id,
      feature: 'flashcards',
      model: modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: 'error',
      errorMessage: `ai_generations insert failed: ${genErr?.message ?? 'unknown'}`,
    });
    return NextResponse.json(
      { error: 'Failed to save generation audit row.' },
      { status: 500 },
    );
  }

  const generationId = (gen as { id: string }).id;

  // 11. Persist deck + cards
  let result: { deckId: string; insertedCount: number };
  try {
    result = await createFlashcardDeckWithCards({
      lessonId,
      title: deckTitle,
      aiGenerationId: generationId,
      cards: draft.cards ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logUsage(supabase, {
      userId: user.id,
      feature: 'flashcards',
      model: modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: 'error',
      errorMessage: `deck insert failed: ${message}`,
    });
    return NextResponse.json(
      { error: 'Failed to save flashcard deck.' },
      { status: 500 },
    );
  }

  // 12. Log success
  await logUsage(supabase, {
    userId: user.id,
    feature: 'flashcards',
    model: modelUsed,
    inputTokens: tokensIn,
    outputTokens: tokensOut,
    status: 'success',
  });

  return NextResponse.json({
    ok: true,
    deckId: result.deckId,
    insertedCount: result.insertedCount,
    sourceNote: draft.sourceNote ?? null,
    generationId,
    tokens: { input: tokensIn, output: tokensOut },
  });
}