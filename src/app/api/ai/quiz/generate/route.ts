// src/app/api/ai/quiz/generate/route.ts
// POST: generate quiz questions from a lesson or uploaded file(s),
// insert them as drafts into a target quiz activity.
// Auth: teacher of the activity's class (admin allowed).
//
// Accepts multipart/form-data:
//   - activityId: string (target quiz)
//   - sourceLessonId?: string (optional: pull lesson body)
//   - mix: JSON string mapping AIGeneratableKind -> count
//   - files[]?: 0-3 uploaded files (pdf/docx/txt/md)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/client';
import { assertWithinRateLimit } from '@/lib/ai/rate-limit';
import { logUsage } from '@/lib/ai/log';
import { AIError, AIErrors } from '@/lib/ai/errors';
import {
  uploadFilesToGemini,
  buildPartsWithFiles,
  type UploadedFile,
} from '@/lib/ai/uploadFile';
import {
  QUIZ_GENERATOR_SYSTEM_INSTRUCTION,
  QUIZ_GENERATOR_RESPONSE_SCHEMA,
  buildQuizGeneratorUserPrompt,
  validateAndConvert,
  isAIGeneratableKind,
  type QuestionMix,
  type QuizGeneratorDraft,
  type AIGeneratableKind,
} from '@/lib/ai/prompts/quizGenerator';
import { createQuizQuestion } from '@/lib/actions/quizzes';

export const runtime = 'nodejs';

const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file
const ACCEPTED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // 1. Auth
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    const e = AIErrors.unauthorized();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 2. Parse multipart
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    const e = AIErrors.badInput('expected multipart/form-data');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  const activityId = (form.get('activityId') as string | null)?.trim() ?? '';
  const sourceLessonId = (form.get('sourceLessonId') as string | null)?.trim() ?? '';
  const mixJson = (form.get('mix') as string | null) ?? '';

  if (!activityId) {
    const e = AIErrors.badInput('activityId is required');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  let mix: QuestionMix = {};
  try {
    const parsed = JSON.parse(mixJson || '{}') as Record<string, unknown>;
    for (const [k, v] of Object.entries(parsed)) {
      if (!isAIGeneratableKind(k)) continue;
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isInteger(n) && n > 0 && n <= 20) {
        mix[k as AIGeneratableKind] = n;
      }
    }
  } catch {
    const e = AIErrors.badInput('mix must be a JSON object');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  const totalRequested = Object.values(mix).reduce((a, b) => a + (b ?? 0), 0);
  if (totalRequested === 0) {
    const e = AIErrors.badInput('mix must request at least one question');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  if (totalRequested > 25) {
    const e = AIErrors.badInput('total questions cannot exceed 25');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 3. Files (optional)
  const rawFiles: File[] = [];
  for (const entry of form.getAll('files')) {
    if (entry instanceof File && entry.size > 0) rawFiles.push(entry);
  }
  if (rawFiles.length > MAX_FILES) {
    const e = AIErrors.badInput(`max ${MAX_FILES} files`);
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  for (const f of rawFiles) {
    if (f.size > MAX_FILE_SIZE) {
      const e = AIErrors.badInput(`file "${f.name}" exceeds 10 MB`);
      return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
    }
    if (!ACCEPTED_MIMES.has(f.type)) {
      const e = AIErrors.badInput(
        `file "${f.name}" type ${f.type || 'unknown'} not supported (pdf/docx/txt/md only)`,
      );
      return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
    }
  }

  // 4. Role check
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || (profile.role !== 'teacher' && profile.role !== 'admin')) {
    const e = AIErrors.forbidden();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 5. Verify activity is a quiz, get class_id, check lock
  const { data: activity, error: actErr } = await supabase
    .from('activities')
    .select('id, class_id, title, activity_kind')
    .eq('id', activityId)
    .single();
  if (actErr || !activity) {
    const e = AIErrors.forbidden();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  if (activity.activity_kind !== 'quiz') {
    const e = AIErrors.badInput('activity is not a quiz');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // Lock check (any submitted attempt locks the quiz)
  const { count: lockedAttempts } = await supabase
    .from('quiz_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('activity_id', activityId)
    .not('submitted_at', 'is', null);
  if ((lockedAttempts ?? 0) > 0) {
    const e = AIErrors.badInput('quiz is locked — at least one student has submitted an attempt');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 6. Optionally fetch lesson source
  let lessonTitle: string | undefined;
  let lessonBody: string | undefined;
  if (sourceLessonId) {
    const { data: lesson, error: lessonErr } = await supabase
      .from('module_lessons')
      .select('id, title, body, module_id')
      .eq('id', sourceLessonId)
      .single();
    if (lessonErr || !lesson) {
      const e = AIErrors.badInput('lesson not found or access denied');
      return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
    }
    // Verify lesson belongs to the same class as the activity (RLS should
    // already cover this, but defense in depth).
    const { data: mod } = await supabase
      .from('class_modules')
      .select('class_id')
      .eq('id', lesson.module_id)
      .single();
    if (!mod || mod.class_id !== activity.class_id) {
      const e = AIErrors.badInput('lesson is not in this class');
      return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
    }
    lessonTitle = lesson.title;
    lessonBody = lesson.body;
  }

  if (!lessonBody && rawFiles.length === 0) {
    const e = AIErrors.badInput('provide either a source lesson or upload a file');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 7. Rate limit
  try {
    await assertWithinRateLimit(supabase, user.id);
  } catch (err) {
    if (err instanceof AIError) {
      await logUsage(supabase, {
        userId: user.id,
        feature: 'quiz',
        status: 'rate_limited',
      });
      return NextResponse.json({ error: err.userMessage }, { status: err.statusCode });
    }
    throw err;
  }

  // 8. Upload files to Gemini (if any)
  let uploaded: UploadedFile[] = [];
  if (rawFiles.length > 0) {
    try {
      uploaded = await uploadFilesToGemini(
        rawFiles.map((f) => ({
          data: f,
          mimeType: f.type,
          displayName: f.name,
        })),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logUsage(supabase, {
        userId: user.id,
        feature: 'quiz',
        status: 'error',
        errorMessage: `file upload failed: ${message}`,
      });
      return NextResponse.json(
        { error: 'Could not upload the source file. Please try again.' },
        { status: 502 },
      );
    }
  }

  // 9. Call Gemini
  let draft: QuizGeneratorDraft;
  let modelUsed = '';
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const userPrompt = buildQuizGeneratorUserPrompt({
      lessonTitle,
      lessonBody,
      hasUploadedFiles: uploaded.length > 0,
      mix,
    });
    const promptParts =
      uploaded.length > 0
        ? buildPartsWithFiles(uploaded, userPrompt)
        : userPrompt;

    const result = await generateText({
      model: 'fast',
      systemInstruction: QUIZ_GENERATOR_SYSTEM_INSTRUCTION,
      prompt: promptParts,
      responseSchema: QUIZ_GENERATOR_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.6,
    });
    modelUsed = result.modelUsed;
    tokensIn = result.tokens.input;
    tokensOut = result.tokens.output;

    try {
      draft = JSON.parse(result.text) as QuizGeneratorDraft;
    } catch {
      throw AIErrors.geminiFailed('model returned non-JSON output');
    }
    if (
      typeof draft !== 'object' ||
      draft === null ||
      !Array.isArray(draft.questions)
    ) {
      throw AIErrors.geminiFailed('model output missing questions array');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logUsage(supabase, {
      userId: user.id,
      feature: 'quiz',
      model: modelUsed || undefined,
      inputTokens: tokensIn || undefined,
      outputTokens: tokensOut || undefined,
      status: 'error',
      errorMessage: message,
    });
    const status = err instanceof AIError ? err.statusCode : 500;
    const userMsg =
      err instanceof AIError ? err.userMessage : 'Failed to generate questions.';
    return NextResponse.json({ error: userMsg }, { status });
  }

  // 10. Handle AI decline (off-topic, unreadable, etc.)
  if (draft.errorMessage) {
    await logUsage(supabase, {
      userId: user.id,
      feature: 'quiz',
      model: modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: 'success',  // success in the sense that the API call worked
    });
    return NextResponse.json({
      inserted: 0,
      rejected: [],
      message: draft.errorMessage,
      sourceNote: draft.sourceNote,
    });
  }

  // 11. Validate + convert
  const { ok: validated, rejected } = validateAndConvert(draft.questions);

  // 12. Persist ai_generations row (audit trail)
  const { data: genRow, error: genErr } = await supabase
    .from('ai_generations')
    .insert({
      teacher_id: user.id,
      class_id: activity.class_id,
      feature: 'quiz',
      status: 'draft',
      input_params: {
        activityId,
        sourceLessonId: sourceLessonId || null,
        mix,
        fileCount: rawFiles.length,
        totalRequested,
      },
      raw_output: draft as unknown as Record<string, unknown>,
      source_file_refs: uploaded.map((u) => u.name).filter(Boolean),
      model_used: modelUsed,
      tokens_used: tokensIn + tokensOut,
    })
    .select('id')
    .single();
  if (genErr) {
    // Non-fatal: log and continue. The teacher still gets the questions.
    console.warn('[quiz/generate] ai_generations insert failed:', genErr.message);
  }

  // 13. Insert validated questions via existing action (handles lock + ordering)
  const inserted: Array<{ id: string; kind: string; prompt: string }> = [];
  for (const q of validated) {
    try {
      const { questionId } = await createQuizQuestion({
        activityId,
        questionKind: q.kind,
        prompt: q.prompt,
        points: q.points,
        shuffleOptions: q.kind === 'mc_single' || q.kind === 'mc_multi',
        config: q.config,
      });
      inserted.push({ id: questionId, kind: q.kind, prompt: q.prompt });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      rejected.push({
        index: -1,
        reason: `insert failed for "${q.prompt.slice(0, 40)}…": ${message}`,
      });
    }
  }

  // 14. Mark ai_generations as published if we inserted at least one
  if (genRow?.id && inserted.length > 0) {
    await supabase
      .from('ai_generations')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .eq('id', genRow.id);
  }

  // 15. Log success
  await logUsage(supabase, {
    userId: user.id,
    feature: 'quiz',
    model: modelUsed,
    inputTokens: tokensIn,
    outputTokens: tokensOut,
    status: 'success',
  });

  return NextResponse.json({
    inserted: inserted.length,
    rejected: rejected.length,
    rejectedReasons: rejected.map((r) => r.reason).slice(0, 5),
    sourceNote: draft.sourceNote,
    insertedQuestions: inserted,
    generationId: genRow?.id ?? null,
  });
}