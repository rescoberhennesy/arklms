// src/app/api/ai/feedback/quiz/route.ts
// POST: generate overall feedback for a single quiz attempt.
// Auth: teacher of the attempt's class (admin allowed).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/client';
import { assertWithinRateLimit } from '@/lib/ai/rate-limit';
import { logUsage } from '@/lib/ai/log';
import { AIError, AIErrors } from '@/lib/ai/errors';
import {
  FEEDBACK_RESPONSE_SCHEMA,
  QUIZ_FEEDBACK_SYSTEM_INSTRUCTION,
  buildQuizFeedbackUserPrompt,
  type FeedbackDraft,
  type QuizFeedbackQuestionInput,
} from '@/lib/ai/prompts/feedback';
import type { QuestionKind } from '@/lib/types/quizzes';

export const runtime = 'nodejs';

type ReqBody = {
  attemptId?: string;
};

// Question shape we read from quiz_questions for this route.
type QuestionRowLite = {
  id: string;
  question_kind: QuestionKind;
  prompt: string;
  points: string | number;
  display_order: number;
  config: Record<string, unknown>;
};

// Response shape we read from quiz_responses for this route.
type ResponseRowLite = {
  question_id: string;
  answer: Record<string, unknown>;
  auto_correct: boolean | null;
  auto_points: string | number | null;
  manual_points: string | number | null;
};

const PROMPT_PREVIEW_MAX = 140;
const ANSWER_EXCERPT_MAX = 200;

function truncate(s: string, n: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

// Derive a coarse correctness hint per response. The model uses this to
// shape narrative ("you got every matching question right", etc).
function deriveStatus(
  kind: QuestionKind,
  pointsMax: number,
  awarded: number | null,
): QuizFeedbackQuestionInput['status'] {
  if (awarded === null) return 'ungraded';
  if (awarded >= pointsMax) return 'correct';
  if (awarded <= 0) return 'incorrect';
  return 'partial';
}

// For free-text answers (essay / short_answer), pull a short excerpt to
// give the model some content to reference. Objective kinds get null.
function extractAnswerExcerpt(
  kind: QuestionKind,
  answer: Record<string, unknown> | null,
): string | null {
  if (!answer) return null;
  if (kind === 'essay' || kind === 'short_answer') {
    const text = typeof answer.text === 'string' ? answer.text : '';
    if (!text.trim()) return null;
    return truncate(text, ANSWER_EXCERPT_MAX);
  }
  return null;
}

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

  // 2. Parse body
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    const e = AIErrors.badInput('invalid JSON body');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  const attemptId = body.attemptId?.trim();
  if (!attemptId) {
    const e = AIErrors.badInput('attemptId is required');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
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

  // 4. Fetch attempt + activity. RLS filters to teacher-of-class.
  const { data: attemptData, error: attemptErr } = await supabase
    .from('quiz_attempts')
    .select(
      'id, activity_id, auto_score, manual_score_override, submitted_at',
    )
    .eq('id', attemptId)
    .single();
  if (attemptErr || !attemptData) {
    const e = AIErrors.forbidden();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  const { data: activityData, error: actErr } = await supabase
    .from('activities')
    .select('id, title, class_id, quiz_total_points')
    .eq('id', attemptData.activity_id)
    .single();
  if (actErr || !activityData) {
    const e = AIErrors.forbidden();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 5. Fetch questions + responses
  const [
    { data: questionRows, error: qErr },
    { data: responseRows, error: rErr },
  ] = await Promise.all([
    supabase
      .from('quiz_questions')
      .select('id, question_kind, prompt, points, display_order, config')
      .eq('activity_id', activityData.id)
      .order('display_order', { ascending: true }),
    supabase
      .from('quiz_responses')
      .select('question_id, answer, auto_correct, auto_points, manual_points')
      .eq('attempt_id', attemptId),
  ]);
  if (qErr || rErr) {
    const e = AIErrors.badInput('failed to load quiz data');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  const questions = (questionRows ?? []) as QuestionRowLite[];
  if (questions.length === 0) {
    const e = AIErrors.badInput('quiz has no questions');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  const responsesByQ = new Map<string, ResponseRowLite>();
  for (const r of (responseRows ?? []) as ResponseRowLite[]) {
    responsesByQ.set(r.question_id, r);
  }

  // 6. Build per-question summary for the prompt.
  const promptQuestions: QuizFeedbackQuestionInput[] = questions.map((q, i) => {
    const resp = responsesByQ.get(q.id) ?? null;
    const pointsMax = Number(q.points);
    const manual =
      resp?.manual_points === null || resp?.manual_points === undefined
        ? null
        : Number(resp.manual_points);
    const auto =
      resp?.auto_points === null || resp?.auto_points === undefined
        ? null
        : Number(resp.auto_points);
    const awarded = manual !== null ? manual : auto;
    return {
      index: i + 1,
      kind: q.question_kind,
      promptPreview: q.prompt.trim()
        ? truncate(q.prompt, PROMPT_PREVIEW_MAX)
        : '(no prompt set)',
      pointsAwarded: awarded,
      pointsMax,
      status: deriveStatus(q.question_kind, pointsMax, awarded),
      studentAnswerExcerpt: resp
        ? extractAnswerExcerpt(q.question_kind, resp.answer)
        : null,
    };
  });

  // 7. Compute totals for the prompt + score band.
  const totalAwarded = promptQuestions.reduce(
    (acc, q) => acc + (q.pointsAwarded ?? 0),
    0,
  );
  const maxScore = Number(activityData.quiz_total_points ?? 0) ||
    promptQuestions.reduce((acc, q) => acc + q.pointsMax, 0);

  // 8. Rate limit
  try {
    await assertWithinRateLimit(supabase, user.id);
  } catch (err) {
    if (err instanceof AIError) {
      await logUsage(supabase, {
        userId: user.id,
        feature: 'feedback',
        status: 'rate_limited',
      });
      return NextResponse.json(
        { error: err.userMessage },
        { status: err.statusCode },
      );
    }
    throw err;
  }

  // 9. Call Gemini
  let draft: FeedbackDraft;
  let modelUsed = '';
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const result = await generateText({
      model: 'fast',
      systemInstruction: QUIZ_FEEDBACK_SYSTEM_INSTRUCTION,
      prompt: buildQuizFeedbackUserPrompt({
        activityTitle: activityData.title,
        totalScore: totalAwarded,
        maxScore,
        questions: promptQuestions,
      }),
      responseSchema: FEEDBACK_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.5,
    });

    modelUsed = result.modelUsed;
    tokensIn = result.tokens.input;
    tokensOut = result.tokens.output;

    try {
      draft = JSON.parse(result.text) as FeedbackDraft;
    } catch {
      throw AIErrors.geminiFailed('model returned non-JSON output');
    }
    if (typeof draft.feedback !== 'string' || typeof draft.tone !== 'string') {
      throw AIErrors.geminiFailed('model output missing required fields');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logUsage(supabase, {
      userId: user.id,
      feature: 'feedback',
      status: 'error',
      errorMessage: message,
    });
    const status = err instanceof AIError ? err.statusCode : 500;
    const userMsg =
      err instanceof AIError ? err.userMessage : 'Failed to generate feedback.';
    return NextResponse.json({ error: userMsg }, { status });
  }

  // 10. Persist draft
  const pct = maxScore > 0 ? (totalAwarded / maxScore) * 100 : 0;
  const band = pct >= 85 ? 'HIGH' : pct >= 60 ? 'MID' : 'LOW';

  const { data: gen, error: genErr } = await supabase
    .from('ai_generations')
    .insert({
      teacher_id: user.id,
      class_id: activityData.class_id,
      feature: 'feedback',
      status: 'draft',
      input_params: {
        kind: 'quiz_attempt',
        attemptId,
        activityId: activityData.id,
        totalScore: totalAwarded,
        maxScore,
        scoreBand: band,
      },
      raw_output: draft,
      model_used: modelUsed,
      tokens_used: tokensIn + tokensOut,
    })
    .select('id')
    .single();

  if (genErr || !gen) {
    await logUsage(supabase, {
      userId: user.id,
      feature: 'feedback',
      model: modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: 'error',
      errorMessage: `draft persistence failed: ${genErr?.message ?? 'unknown'}`,
    });
    return NextResponse.json(
      { warning: 'Draft generated but could not be saved.', draft },
      { status: 200 },
    );
  }

  // 11. Log success
  await logUsage(supabase, {
    userId: user.id,
    feature: 'feedback',
    model: modelUsed,
    inputTokens: tokensIn,
    outputTokens: tokensOut,
    status: 'success',
  });

  return NextResponse.json({
    generationId: gen.id,
    draft,
    tokens: { input: tokensIn, output: tokensOut },
  });
}
