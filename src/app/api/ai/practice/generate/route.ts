// src/app/api/ai/practice/generate/route.ts
// POST: generate practice questions from a lesson or uploaded file(s),
// persist them as a new practice_session owned by the calling student.
// Auth: any authenticated student (admins/teachers also allowed — they
// can study too; RLS on practice_* tables scopes everything to owner).
//
// Accepts multipart/form-data:
//   - title?: string                 (defaults to lesson title or "Practice — {timestamp}")
//   - sourceKind: 'lesson' | 'upload'
//   - sourceLessonId?: string        (required when sourceKind === 'lesson')
//   - difficulty: 'easy' | 'medium' | 'hard' | 'mixed'
//   - requestedCount: 5 | 10 | 15    (strictly one of these three)
//   - files[]?: 0-3 uploaded files (pdf/docx/txt/md) when sourceKind === 'upload'

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
  buildQuizGeneratorUserPrompt,
  validateAndConvert,
  type QuestionMix,
  type QuizGeneratorDraft,
  type AIQuestion,
} from '@/lib/ai/prompts/quizGenerator';
import { createPracticeSession } from '@/lib/actions/practice';
import {
  PRACTICE_DIFFICULTIES,
  PRACTICE_SOURCE_KINDS,
  type PracticeDifficulty,
  type PracticeSourceKind,
  type PracticeQuestionConfig,  // ← add this
} from '@/lib/types/practice';

type PracticeKind = 'mc_single' | 'mc_multi' | 'true_false' | 'short_answer';

/** Practice sessions are self-checked, so only auto-gradable kinds are allowed. */
function isPracticeKind<T extends { kind: string }>(q: T): q is T & { kind: PracticeKind } {
  return (
    q.kind === 'mc_single' ||
    q.kind === 'mc_multi' ||
    q.kind === 'true_false' ||
    q.kind === 'short_answer'
  );
}

export const runtime = 'nodejs';

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file
const ACCEPTED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]);

// UI offers exactly these three counts. Stricter than the DB's 1-25 check
// constraint so a tampered client can't bypass the UI.
const ALLOWED_COUNTS = [5, 10, 15] as const;
type AllowedCount = (typeof ALLOWED_COUNTS)[number];

function isAllowedCount(n: number): n is AllowedCount {
  return (ALLOWED_COUNTS as readonly number[]).includes(n);
}

function isDifficulty(s: string): s is PracticeDifficulty {
  return (PRACTICE_DIFFICULTIES as readonly string[]).includes(s);
}

function isSourceKind(s: string): s is PracticeSourceKind {
  return (PRACTICE_SOURCE_KINDS as readonly string[]).includes(s);
}

// --------------------------------------------------------------------------
// Mix builder — turn a single count + difficulty into a balanced kind mix
// --------------------------------------------------------------------------
// The teacher tool lets the user choose how many of each kind. Practice
// hides that complexity: the student picks a total count, we choose a
// reasonable mix. Roughly: half mc_single, with a sprinkle of the others.
// Easy leans toward true_false; hard leans toward short_answer.

function buildMixForCount(
  count: AllowedCount,
  difficulty: PracticeDifficulty,
): QuestionMix {
  // Distributions chosen to feel varied without being random:
  // [mc_single, mc_multi, true_false, short_answer]
  const profiles: Record<PracticeDifficulty, Record<5 | 10 | 15, [number, number, number, number]>> = {
    easy: {
      5:  [2, 0, 2, 1],
      10: [4, 1, 3, 2],
      15: [6, 2, 4, 3],
    },
    medium: {
      5:  [2, 1, 1, 1],
      10: [4, 2, 2, 2],
      15: [6, 3, 3, 3],
    },
    hard: {
      5:  [2, 1, 0, 2],
      10: [3, 2, 1, 4],
      15: [5, 3, 1, 6],
    },
    mixed: {
      5:  [2, 1, 1, 1],
      10: [4, 2, 2, 2],
      15: [5, 3, 3, 4],
    },
  };
  const [s, m, tf, sa] = profiles[difficulty][count];
  const mix: QuestionMix = {};
  if (s > 0) mix.mc_single = s;
  if (m > 0) mix.mc_multi = m;
  if (tf > 0) mix.true_false = tf;
  if (sa > 0) mix.short_answer = sa;
  return mix;
}

// --------------------------------------------------------------------------
// Difficulty directive — appended to the quiz generator user prompt
// --------------------------------------------------------------------------
// We don't touch buildQuizGeneratorUserPrompt to keep teacher quiz behavior
// unchanged. Instead we append a short block at the end of the prompt that
// the system instruction will respect.

function buildDifficultyDirective(difficulty: PracticeDifficulty): string {
  switch (difficulty) {
    case 'easy':
      return [
        'DIFFICULTY: easy',
        '- Focus on direct recall of explicitly stated facts, definitions, and named concepts.',
        '- Keep prompts short and unambiguous. Distractors should be clearly different from the answer.',
        '- Avoid multi-step reasoning or synthesis across paragraphs.',
      ].join('\n');
    case 'medium':
      return [
        'DIFFICULTY: medium',
        '- Mix recall with light application. Ask the student to identify examples, compare two concepts, or apply a definition to a new case.',
        '- Distractors should be plausible — drawn from related ideas in the source.',
      ].join('\n');
    case 'hard':
      return [
        'DIFFICULTY: hard',
        '- Emphasize synthesis, inference, and application. The student should need to combine ideas from multiple parts of the source.',
        '- Distractors should be tempting — share surface features with the correct answer.',
        '- Prefer short_answer for specific terms and mc_multi for "which of the following apply" style questions.',
        '- Still stay strictly grounded in the source. Hard does not mean trick.',
      ].join('\n');
    case 'mixed':
      return [
        'DIFFICULTY: mixed',
        '- Vary difficulty across the set: roughly a third easy recall, a third medium application, a third harder synthesis.',
        '- Order from easier to harder.',
      ].join('\n');
  }
}

// --------------------------------------------------------------------------
// Response schema (extends the quiz generator schema with `explanation`)
// --------------------------------------------------------------------------
// We need a per-question `explanation` field that the quiz schema doesn't
// have. Practice is a study tool; explanations are the core UX win. We
// declare the schema locally rather than touching QUIZ_GENERATOR_RESPONSE_SCHEMA.

const PRACTICE_GENERATOR_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    errorMessage: { type: 'string', nullable: true },
    sourceNote: { type: 'string', nullable: true },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['mc_single', 'mc_multi', 'true_false', 'short_answer'],
          },
          prompt: { type: 'string' },
          points: { type: 'number' },
          options: {
            type: 'array',
            items: { type: 'string' },
            nullable: true,
          },
          correctIndex: { type: 'integer', nullable: true },
          correctIndices: {
            type: 'array',
            items: { type: 'integer' },
            nullable: true,
          },
          correct: { type: 'boolean', nullable: true },
          acceptable: {
            type: 'array',
            items: { type: 'string' },
            nullable: true,
          },
          explanation: { type: 'string', nullable: true },
        },
        required: ['kind', 'prompt', 'points'],
        propertyOrdering: [
          'kind',
          'prompt',
          'points',
          'options',
          'correctIndex',
          'correctIndices',
          'correct',
          'acceptable',
          'explanation',
        ],
      },
    },
  },
  required: ['errorMessage', 'sourceNote', 'questions'],
  propertyOrdering: ['errorMessage', 'sourceNote', 'questions'],
} as const;

// Practice-specific addition to the system instruction. Appended after the
// shared quiz generator instruction so the explanation requirement lands
// right alongside the per-kind rules.
const PRACTICE_SYSTEM_ADDENDUM = `

PRACTICE MODE — ADDITIONAL RULES:

This is a personal study session for one student. They will see each
question, answer it, and immediately see whether they got it right along
with an explanation of why. Tailor your questions and explanations for
self-study, not classroom assessment.

EXPLANATIONS (REQUIRED for every question):
- Add an "explanation" field to every question.
- Keep it to one or two sentences (max ~40 words).
- Explain WHY the correct answer is correct, grounded in the source.
  Do not just restate the answer.
- For mc_single and mc_multi, you may briefly note why the most tempting
  distractor is wrong — but only if it materially helps. Don't pad.
- Match the language of the question (English / Filipino / Taglish).
- Never say "as stated in the document" or "see page X" — the student
  doesn't have the source in front of them.

TONE:
- Encouraging and direct. This is study, not a test. The student WANTS
  to learn from wrong answers.
`.trim();

// --------------------------------------------------------------------------
// Route handler
// --------------------------------------------------------------------------

export async function POST(req: NextRequest) {
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

  // 2. Parse multipart
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    const e = AIErrors.badInput('expected multipart/form-data');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  const titleRaw = (form.get('title') as string | null)?.trim() ?? '';
  const sourceKindRaw = (form.get('sourceKind') as string | null)?.trim() ?? '';
  const sourceLessonId = (form.get('sourceLessonId') as string | null)?.trim() ?? '';
  const difficultyRaw = (form.get('difficulty') as string | null)?.trim() ?? '';
  const requestedCountRaw = (form.get('requestedCount') as string | null)?.trim() ?? '';

  // 3. Validate scalars
  if (!isSourceKind(sourceKindRaw)) {
    const e = AIErrors.badInput('sourceKind must be "lesson" or "upload"');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  const sourceKind: PracticeSourceKind = sourceKindRaw;

  if (!isDifficulty(difficultyRaw)) {
    const e = AIErrors.badInput('difficulty must be easy/medium/hard/mixed');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  const difficulty: PracticeDifficulty = difficultyRaw;

  const requestedCountNum = Number(requestedCountRaw);
  if (!Number.isInteger(requestedCountNum) || !isAllowedCount(requestedCountNum)) {
    const e = AIErrors.badInput('requestedCount must be 5, 10, or 15');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  const requestedCount: AllowedCount = requestedCountNum;

  // 4. Validate source-kind-specific inputs
  if (sourceKind === 'lesson' && !sourceLessonId) {
    const e = AIErrors.badInput('sourceLessonId is required when sourceKind is "lesson"');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  const rawFiles: File[] = [];
  for (const entry of form.getAll('files')) {
    if (entry instanceof File && entry.size > 0) rawFiles.push(entry);
  }
  if (sourceKind === 'upload' && rawFiles.length === 0) {
    const e = AIErrors.badInput('at least one file is required when sourceKind is "upload"');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
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

  // 5. Role check — practice is open to any authenticated user. We don't
  // gate on role; admins/teachers studying their own material is fine.
  // RLS on practice_* tables already restricts ownership to the caller.
  // (We DO still verify the profile exists so we don't generate for
  // orphaned auth.users rows.)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile) {
    // Bypass the canned "Only teachers..." message in AIErrors.forbidden().
    return NextResponse.json(
      { error: 'Your account is not set up to use this feature.' },
      { status: 403 },
    );
  }

  // 6. Fetch lesson source if requested. Verify the student can actually
  // see this lesson by checking enrollment in the lesson's class. RLS on
  // module_lessons should already enforce this for students, but defense
  // in depth — and we need the title for the auto-generated session title.
  let lessonTitle: string | undefined;
  let lessonBody: string | undefined;
  let resolvedClassId: string | null = null;

  if (sourceKind === 'lesson') {
    const { data: lesson, error: lessonErr } = await supabase
      .from('module_lessons')
      .select('id, title, body, module_id')
      .eq('id', sourceLessonId)
      .maybeSingle();
    if (lessonErr || !lesson) {
      const e = AIErrors.badInput('lesson not found or access denied');
      return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
    }

    const { data: mod } = await supabase
      .from('class_modules')
      .select('class_id')
      .eq('id', lesson.module_id)
      .maybeSingle();
    if (!mod) {
      const e = AIErrors.badInput('lesson module not found');
      return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
    }
    resolvedClassId = mod.class_id as string;

    // For students, require an enrollment in this class. Teachers/admins
    // are exempt — they may want to practice on their own content.
    if (profile.role === 'student') {
      const { count: enrollmentCount, error: enrollErr } = await supabase
        .from('class_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('class_id', resolvedClassId)
        .eq('student_id', user.id);
      if (enrollErr) {
        return NextResponse.json(
          { error: 'Could not verify class access. Please try again.' },
          { status: 500 },
        );
      }
      if ((enrollmentCount ?? 0) === 0) {
        const e = AIErrors.badInput('you are not enrolled in this class');
        return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
      }
    }

    lessonTitle = lesson.title as string;
    lessonBody = (lesson.body as string | null) ?? undefined;

    if (!lessonBody || lessonBody.trim().length === 0) {
      const e = AIErrors.badInput('this lesson has no content to practice from');
      return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
    }
  }

  // 7. Rate limit (shared bucket across all AI features)
  try {
    await assertWithinRateLimit(supabase, user.id);
  } catch (err) {
    if (err instanceof AIError) {
      await logUsage(supabase, {
        userId: user.id,
        feature: 'practice',
        status: 'rate_limited',
      });
      return NextResponse.json({ error: err.userMessage }, { status: err.statusCode });
    }
    throw err;
  }

  // 8. Upload files to Gemini (only when sourceKind === 'upload')
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
        feature: 'practice',
        status: 'error',
        errorMessage: `file upload failed: ${message}`,
      });
      return NextResponse.json(
        { error: 'Could not upload your file. Please try again.' },
        { status: 502 },
      );
    }
  }

  // 9. Build mix + prompt, call Gemini
  const mix = buildMixForCount(requestedCount, difficulty);

  let draft: QuizGeneratorDraft;
  let modelUsed = '';
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const basePrompt = buildQuizGeneratorUserPrompt({
      lessonTitle,
      lessonBody,
      hasUploadedFiles: uploaded.length > 0,
      mix,
    });
    const userPrompt = `${basePrompt}\n\n${buildDifficultyDirective(difficulty)}`;

    const systemInstruction = `${QUIZ_GENERATOR_SYSTEM_INSTRUCTION}\n\n${PRACTICE_SYSTEM_ADDENDUM}`;

    const promptParts =
      uploaded.length > 0
        ? buildPartsWithFiles(uploaded, userPrompt)
        : userPrompt;

    const result = await generateText({
      model: 'fast',
      systemInstruction,
      prompt: promptParts,
      responseSchema: PRACTICE_GENERATOR_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
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
      feature: 'practice',
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

  // 10. Handle AI decline (off-topic, unreadable, prompt injection, etc.)
  if (draft.errorMessage) {
    await logUsage(supabase, {
      userId: user.id,
      feature: 'practice',
      model: modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: 'success', // the call worked; the model declined the content
    });
    return NextResponse.json(
      {
        sessionId: null,
        inserted: 0,
        rejected: 0,
        message: draft.errorMessage,
        sourceNote: draft.sourceNote,
      },
      { status: 422 },
    );
  }

  // 11. Validate + convert. The shared validator drops malformed questions
  // but does not look at `explanation` (it's not part of AIQuestion). We
  // pull explanations off the raw draft and zip them back in by index.
  const { ok: validated, rejected } = validateAndConvert(
    draft.questions as AIQuestion[],
  );

  if (validated.length === 0) {
    await logUsage(supabase, {
      userId: user.id,
      feature: 'practice',
      model: modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: 'success',
    });
    return NextResponse.json(
      {
        sessionId: null,
        inserted: 0,
        rejected: rejected.length,
        rejectedReasons: rejected.map((r) => r.reason).slice(0, 5),
        message:
          'The AI returned questions but none passed validation. Try a different source or count.',
      },
      { status: 422 },
    );
  }

  // Build an index from validated questions back to their raw position so
  // we can recover the matching explanation. validateAndConvert preserves
  // order for accepted questions, but indices shift when some are dropped.
  // Easiest reliable mapping: walk the raw questions, accept the next
  // validated entry whose prompt matches.
  const explanationsByPrompt = new Map<string, string>();
  for (const raw of draft.questions as Array<AIQuestion & { explanation?: string | null }>) {
    if (typeof raw.explanation === 'string' && raw.explanation.trim()) {
      explanationsByPrompt.set(raw.prompt.trim(), raw.explanation.trim());
    }
  }

  // 12. Build the session title. Prefer an explicit user title; fall back
  // to the lesson title; final fallback is a timestamp.
  let title = titleRaw;
  if (!title) {
    if (lessonTitle) title = `Practice: ${lessonTitle}`;
    else if (uploaded.length > 0) {
      const first = uploaded[0].displayName;
      title = uploaded.length === 1 ? `Practice: ${first}` : `Practice: ${first} +${uploaded.length - 1}`;
    } else {
      title = `Practice — ${new Date().toLocaleString()}`;
    }
  }

  // 13. Persist the session + questions via the existing server action.
  let sessionId: string;
  try {
    const created = await createPracticeSession({
      title,
      sourceKind,
      sourceLessonId: sourceKind === 'lesson' ? sourceLessonId : null,
      sourceFileNames: uploaded.map((u) => u.displayName),
      sourceNote: draft.sourceNote ?? null,
      difficulty,
      requestedCount,
      modelUsed,
      tokensUsed: tokensIn + tokensOut,

    questions: validated.filter(isPracticeKind).map((q) => ({
        kind: q.kind,
        prompt: q.prompt,
        points: q.points,
        // Safe cast: PRACTICE_GENERATOR_RESPONSE_SCHEMA only permits the 4
        // auto-gradable kinds, so q.config can only be one of the 4 practice
        // config shapes — never EssayConfig or MatchingConfig. TS can't
        // narrow the broader QuestionConfig union from q.kind alone, so we
        // assert it here. validateAndConvert further guarantees per-kind
        // structure (correct[] indices in range, etc.).
        config: q.config as PracticeQuestionConfig,
        explanation: explanationsByPrompt.get(q.prompt) ?? null,
      })),

    });
    sessionId = created.sessionId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logUsage(supabase, {
      userId: user.id,
      feature: 'practice',
      model: modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: 'error',
      errorMessage: `persist failed: ${message}`,
    });
    return NextResponse.json(
      { error: 'Generated questions but could not save the session. Please try again.' },
      { status: 500 },
    );
  }

  // 14. Log success
  await logUsage(supabase, {
    userId: user.id,
    feature: 'practice',
    model: modelUsed,
    inputTokens: tokensIn,
    outputTokens: tokensOut,
    status: 'success',
  });

  return NextResponse.json({
    sessionId,
    inserted: validated.length,
    rejected: rejected.length,
    rejectedReasons: rejected.map((r) => r.reason).slice(0, 5),
    sourceNote: draft.sourceNote,
    title,
  });
}