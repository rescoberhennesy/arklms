// src/app/api/ai/activity-prompt/route.ts
//
// POST (multipart/form-data): generate questions for an activity's
// Question / prompt section. Teacher/admin only. Does NOT save anything to
// the activity: returns Markdown the teacher reviews and saves.
//
// Fields: activityId, count (1-10), style, focus, includePoints ("true"/"false"),
//         files[] (0-5 PDF/DOCX, <=20 MB each)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/client';
import { uploadFilesToGemini, buildPartsWithFiles } from '@/lib/ai/uploadFile';
import { assertWithinRateLimit } from '@/lib/ai/rate-limit';
import { logUsage } from '@/lib/ai/log';
import { AIError, AIErrors } from '@/lib/ai/errors';
import { SUBMISSION_TYPE_LABELS, type SubmissionType } from '@/lib/types/activities';
import {
  ACTIVITY_PROMPT_SYSTEM_INSTRUCTION,
  ACTIVITY_PROMPT_RESPONSE_SCHEMA,
  buildActivityPromptUserPrompt,
  validateActivityPromptDraft,
  renderActivityPromptMarkdown,
  type ActivityQuestionStyle,
} from '@/lib/ai/prompts/activityPrompt';

export const runtime = 'nodejs';

const FEATURE = 'activity_prompt';
const MAX_FILES = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const STYLES: ActivityQuestionStyle[] = [
  'identification',
  'true_false',
  'multiple_choice',
  'essay',
  'problem',
  'mixed',
];

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

function bad(msg: string) {
  const e = AIErrors.badInput(msg);
  return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
}

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    console.error('[ai/activity-prompt] UNHANDLED:', err);
    return NextResponse.json(
      { error: err instanceof Error ? `Server error: ${err.message}` : 'Unknown server error.' },
      { status: 500 },
    );
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();

  // 1. Auth + role
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    const e = AIErrors.unauthorized();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || (profile.role !== 'teacher' && profile.role !== 'admin')) {
    const e = AIErrors.forbidden();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 2. Parse form
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad('expected multipart/form-data');
  }

  const activityId = (form.get('activityId') as string | null)?.trim();
  if (!activityId) return bad('activityId is required');

  const countRaw = Number(form.get('count'));
  const count = Number.isInteger(countRaw) ? Math.min(10, Math.max(1, countRaw)) : 5;

  const styleRaw = form.get('style') as string | null;
  const style: ActivityQuestionStyle = STYLES.includes(styleRaw as ActivityQuestionStyle)
    ? (styleRaw as ActivityQuestionStyle)
    : 'mixed';

  const focus = ((form.get('focus') as string | null) ?? '').trim().slice(0, 500);
  const includePoints = form.get('includePoints') === 'true';

  const files = form
    .getAll('files')
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) return bad(`at most ${MAX_FILES} files allowed`);

  const prepared: { data: Blob; mimeType: string; displayName: string }[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) return bad(`${file.name} is too large (max 20 MB per file)`);
    const mime = resolveMime(file);
    if (!mime) return bad(`${file.name}: only PDF and DOCX files are supported`);
    prepared.push({ data: file, mimeType: mime, displayName: file.name });
  }

  // 3. Activity (RLS: only the class teacher/admin can read it as a teacher)
  const { data: actRow, error: actErr } = await supabase
    .from('activities')
    .select('id, title, instructions, max_points, submission_type')
    .eq('id', activityId)
    .single();
  if (actErr || !actRow) {
    return NextResponse.json(
      { error: 'Activity not found or you do not have access.' },
      { status: 404 },
    );
  }
  const act = actRow as {
    id: string;
    title: string;
    instructions: string | null;
    max_points: number;
    submission_type: SubmissionType;
  };

  // 4. Rate limit
  try {
    await assertWithinRateLimit(supabase, user.id);
  } catch (err) {
    if (err instanceof AIError) {
      await logUsage(supabase, { userId: user.id, feature: FEATURE, status: 'rate_limited' });
      return NextResponse.json({ error: err.userMessage }, { status: err.statusCode });
    }
    throw err;
  }

  // 5. Upload files (if any)
  let uploaded: Awaited<ReturnType<typeof uploadFilesToGemini>> = [];
  if (prepared.length > 0) {
    try {
      uploaded = await uploadFilesToGemini(prepared);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logUsage(supabase, { userId: user.id, feature: FEATURE, status: 'error', errorMessage: message });
      const status = err instanceof AIError ? err.statusCode : 500;
      return NextResponse.json(
        { error: err instanceof AIError ? err.userMessage : 'File upload to AI failed.' },
        { status },
      );
    }
  }

  // 6. Generate
  let modelUsed = '';
  let tokensIn = 0;
  let tokensOut = 0;
  try {
    const textPrompt = buildActivityPromptUserPrompt({
      activityTitle: act.title,
      instructions: act.instructions ?? '',
      maxPoints: Number(act.max_points) || 0,
      submissionTypeLabel: SUBMISSION_TYPE_LABELS[act.submission_type] ?? act.submission_type,
      count,
      style,
      focus,
      includePoints,
      sourceFileNames: prepared.map((p) => p.displayName),
    });

    const result = await generateText({
      model: 'fast',
      systemInstruction: ACTIVITY_PROMPT_SYSTEM_INSTRUCTION,
      prompt: uploaded.length > 0 ? buildPartsWithFiles(uploaded, textPrompt) : textPrompt,
      responseSchema: ACTIVITY_PROMPT_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.6,
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
    const draft = validateActivityPromptDraft(raw, count);

    await logUsage(supabase, {
      userId: user.id,
      feature: FEATURE,
      model: modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: 'success',
    });

    if (draft.errorMessage) {
      return NextResponse.json({ error: draft.errorMessage }, { status: 422 });
    }

    const markdown = renderActivityPromptMarkdown(
      draft.questions ?? [],
      Number(act.max_points) || 0,
      includePoints,
    );
    return NextResponse.json({ markdown, count: draft.questions?.length ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ai/activity-prompt] generation failed:', message);
    await logUsage(supabase, {
      userId: user.id,
      feature: FEATURE,
      model: modelUsed || undefined,
      inputTokens: tokensIn || undefined,
      outputTokens: tokensOut || undefined,
      status: 'error',
      errorMessage: message,
    });
    const status = err instanceof AIError ? err.statusCode : 500;
    return NextResponse.json(
      { error: err instanceof AIError ? err.userMessage : 'Failed to generate questions. Please try again.' },
      { status },
    );
  }
}