// src/app/api/ai/reviewer/route.ts
// POST (multipart/form-data): generate a study reviewer from up to 5
// source files (PDF/DOCX). Auth: teacher/admin.
//
// Form fields:
//   files[]:        File[]   (1-5 files, each <=20 MB, PDF or DOCX)
//   teacherNote:    string   (optional steering text)
//   includePractice:string   ("true" or "false")
//   classId:        string   (optional, scopes the ai_generations row)

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
  REVIEWER_SYSTEM_INSTRUCTION,
  REVIEWER_RESPONSE_SCHEMA,
  buildReviewerUserPrompt,
  renderReviewerMarkdown,
  type ReviewerDraft,
} from '@/lib/ai/prompts/reviewer';

export const runtime = 'nodejs';

const MAX_FILES = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

// Allowed mime types and the extensions that map to them. Some browsers
// send empty file.type for DOCX (especially on macOS / older systems),
// so we also sniff by extension.
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

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    console.error('[ai/reviewer] UNHANDLED:', err);
    if (err instanceof Error) {
      console.error('[ai/reviewer] stack:', err.stack);
    }
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

  // 2. Role check
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || (profile.role !== 'teacher' && profile.role !== 'admin')) {
    const e = AIErrors.forbidden();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 3. Parse multipart
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    const e = AIErrors.badInput('expected multipart/form-data');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  const teacherNote = (form.get('teacherNote') as string | null)?.trim() ?? '';
  const includePractice =
    (form.get('includePractice') as string | null) === 'true';
  const classId = (form.get('classId') as string | null) || null;

  const files = form.getAll('files').filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    const e = AIErrors.badInput('at least one file is required');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  if (files.length > MAX_FILES) {
    const e = AIErrors.badInput(`at most ${MAX_FILES} files allowed`);
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 4. Per-file validation
  type Prepared = {
    data: Blob;
    mimeType: string;
    displayName: string;
  };
  const prepared: Prepared[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      const e = AIErrors.badInput(
        `${file.name} is too large (max 20 MB per file)`,
      );
      return NextResponse.json(
        { error: e.userMessage },
        { status: e.statusCode },
      );
    }
    const mime = resolveMime(file);
    if (!mime) {
      const e = AIErrors.badInput(
        `${file.name}: only PDF and DOCX files are supported`,
      );
      return NextResponse.json(
        { error: e.userMessage },
        { status: e.statusCode },
      );
    }
    prepared.push({ data: file, mimeType: mime, displayName: file.name });
  }

  // 5. Rate limit
  try {
    await assertWithinRateLimit(supabase, user.id);
  } catch (err) {
    if (err instanceof AIError) {
      await logUsage(supabase, {
        userId: user.id,
        feature: 'reviewer',
        status: 'rate_limited',
      });
      return NextResponse.json(
        { error: err.userMessage },
        { status: err.statusCode },
      );
    }
    throw err;
  }

  // 6. Upload to Gemini File API
  let uploaded: Awaited<ReturnType<typeof uploadFilesToGemini>>;
  try {
    uploaded = await uploadFilesToGemini(prepared);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ai/reviewer] upload failed:', message);
    if (err instanceof Error) console.error(err.stack);
    await logUsage(supabase, {
      userId: user.id,
      feature: 'reviewer',
      status: 'error',
      errorMessage: message,
    });
    const status = err instanceof AIError ? err.statusCode : 500;
    const userMsg =
      err instanceof AIError ? err.userMessage : 'File upload to AI failed.';
    return NextResponse.json({ error: userMsg }, { status });
  }

  // 7. Call Gemini with multipart prompt
  let draft: ReviewerDraft;
  let modelUsed = '';
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const textPrompt = buildReviewerUserPrompt({
      teacherNote,
      includePractice,
      sourceFileNames: prepared.map((p) => p.displayName),
    });
    const parts = buildPartsWithFiles(uploaded, textPrompt);

    const result = await generateText({
      // Use the fast model. Pro is not available on the free Gemini
      // API tier (429 RESOURCE_EXHAUSTED with limit: 0). Flash handles
      // PDF/DOCX grounding well enough for study-material drafts;
      // teacher edits are the safety net.
      model: 'fast',
      systemInstruction: REVIEWER_SYSTEM_INSTRUCTION,
      prompt: parts,
      responseSchema: REVIEWER_RESPONSE_SCHEMA as unknown as Record <
        string,
        unknown
      >,
      temperature: 0.4,
    });

    modelUsed = result.modelUsed;
    tokensIn = result.tokens.input;
    tokensOut = result.tokens.output;

    try {
      draft = JSON.parse(result.text) as ReviewerDraft;
    } catch {
      throw AIErrors.geminiFailed('model returned non-JSON output');
    }

    if (typeof draft.summary !== 'string') {
      throw AIErrors.geminiFailed('model output missing summary');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ai/reviewer] generation failed:', message);
    if (err instanceof Error) console.error(err.stack);
    await logUsage(supabase, {
      userId: user.id,
      feature: 'reviewer',
      model: modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: 'error',
      errorMessage: message,
    });
    const status = err instanceof AIError ? err.statusCode : 500;
    const userMsg =
      err instanceof AIError ? err.userMessage : 'Failed to generate reviewer.';
    return NextResponse.json({ error: userMsg }, { status });
  }

  // 8. If the model declined (off-topic, unreadable, etc.), surface that
  //    without persisting a draft. Log as a successful round-trip — we
  //    used tokens, we got a structured refusal back.
  if (draft.errorMessage && draft.errorMessage.trim()) {
    await logUsage(supabase, {
      userId: user.id,
      feature: 'reviewer',
      model: modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: 'success',
    });
    return NextResponse.json(
      { error: draft.errorMessage.trim() },
      { status: 422 },
    );
  }

  // 9. Render markdown for the lesson body
  const markdown = renderReviewerMarkdown(draft);

  // 10. Persist draft
  const { data: gen, error: genErr } = await supabase
    .from('ai_generations')
    .insert({
      teacher_id: user.id,
      class_id: classId,
      feature: 'reviewer',
      status: 'draft',
      input_params: {
        teacherNote,
        includePractice,
        sourceFileNames: prepared.map((p) => p.displayName),
      },
      raw_output: draft,
      source_file_refs: uploaded.map((u) => u.fileUri),
      model_used: modelUsed,
      tokens_used: tokensIn + tokensOut,
    })
    .select('id')
    .single();

  if (genErr || !gen) {
    await logUsage(supabase, {
      userId: user.id,
      feature: 'reviewer',
      model: modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: 'error',
      errorMessage: `draft persistence failed: ${genErr?.message ?? 'unknown'}`,
    });
    // Still return the draft so the teacher isn't blocked.
    return NextResponse.json(
      {
        warning: 'Draft generated but could not be saved.',
        draft,
        markdown,
      },
      { status: 200 },
    );
  }

  // 11. Log success
  await logUsage(supabase, {
    userId: user.id,
    feature: 'reviewer',
    model: modelUsed,
    inputTokens: tokensIn,
    outputTokens: tokensOut,
    status: 'success',
  });

  return NextResponse.json({
    generationId: gen.id,
    draft,
    markdown,
    tokens: { input: tokensIn, output: tokensOut },
  });
}
