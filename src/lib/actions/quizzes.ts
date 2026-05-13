// src/lib/actions/quizzes.ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ModuleTerm } from '@/lib/types/modules';
import {
  type QuestionKind,
  type QuestionConfig,
  type QuestionAnswer,
  type QuizQuestion,
  type QuizAttempt,
  type QuizResponse,
  type QuizConfig,
  type TeacherQuizView,
  type StudentQuestionView,
  type StudentAttemptView,
  type SanitizedQuestionConfig,
  type AttemptForGradingView,
  type QuizAttemptListItem,
  defaultConfigFor,
  validateQuestionConfig,
} from '@/lib/types/quizzes';
import type { SubmissionType } from '@/lib/types/activities';

// --- Internal row types ---------------------------------------------------

interface QuestionRow {
  id: string;
  activity_id: string;
  question_kind: QuestionKind;
  prompt: string;
  points: string | number;
  display_order: number;
  shuffle_options: boolean;
  config: QuestionConfig;
  created_at: string;
  updated_at: string;
}

interface AttemptRow {
  id: string;
  activity_id: string;
  student_id: string;
  started_at: string;
  submitted_at: string | null;
  auto_score: string | number | null;
  manual_score_override: string | number | null;
  submission_id: string | null;
  feedback: string | null;
  created_at: string;
  updated_at: string;
}

interface ResponseRow {
  id: string;
  attempt_id: string;
  question_id: string;
  answer: QuestionAnswer;
  auto_correct: boolean | null;
  auto_points: string | number | null;
  manual_points: string | number | null;
  feedback: string | null;
  created_at: string;
  updated_at: string;
}

interface ActivityQuizRow {
  id: string;
  class_id: string;
  activity_kind: 'assignment' | 'quiz';
  time_limit_minutes: number | null;
  shuffle_questions: boolean;
  auto_release_grade: boolean;
  show_correct_answers: boolean;
  quiz_total_points: string | number | null;
}

// --- Mappers --------------------------------------------------------------

function mapQuestion(r: QuestionRow): QuizQuestion {
  return {
    id: r.id,
    activityId: r.activity_id,
    questionKind: r.question_kind,
    prompt: r.prompt,
    points: Number(r.points),
    displayOrder: r.display_order,
    shuffleOptions: r.shuffle_options,
    config: r.config,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapAttempt(r: AttemptRow): QuizAttempt {
  return {
    id: r.id,
    activityId: r.activity_id,
    studentId: r.student_id,
    startedAt: r.started_at,
    submittedAt: r.submitted_at,
    autoScore: r.auto_score === null ? null : Number(r.auto_score),
    manualScoreOverride: r.manual_score_override === null ? null : Number(r.manual_score_override),
    submissionId: r.submission_id,
    feedback: r.feedback ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapResponse(r: ResponseRow): QuizResponse {
  return {
    id: r.id,
    attemptId: r.attempt_id,
    questionId: r.question_id,
    answer: r.answer,
    autoCorrect: r.auto_correct,
    autoPoints: r.auto_points === null ? null : Number(r.auto_points),
    manualPoints: r.manual_points === null ? null : Number(r.manual_points),
    feedback: r.feedback ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapActivityToQuizConfig(r: ActivityQuizRow): QuizConfig {
  return {
    timeLimitMinutes: r.time_limit_minutes,
    shuffleQuestions: r.shuffle_questions,
    autoReleaseGrade: r.auto_release_grade,
    showCorrectAnswers: r.show_correct_answers,
    quizTotalPoints:
      r.quiz_total_points === null ? null : Number(r.quiz_total_points),
  };
}

// Strip correct-answer fields from a question's config for student-facing
// reads. Per Session 9 design: students NEVER see correct values during
// the attempt. After submission with show_correct_answers=true, full
// (unsanitized) config is delivered through a different action.
function sanitizeConfig(
  kind: QuestionKind,
  config: QuestionConfig,
): SanitizedQuestionConfig {
  switch (kind) {
    case 'mc_single':
    case 'mc_multi': {
      const c = config as { options: string[] };
      return { options: c.options };
    }
    case 'matching': {
      const c = config as { left: string[]; right: string[] };
      return { left: c.left, right: c.right };
    }
    case 'true_false':
    case 'short_answer':
    case 'essay':
      return {};
  }
}

function sanitizeQuestion(q: QuizQuestion): StudentQuestionView {
  return {
    id: q.id,
    activityId: q.activityId,
    questionKind: q.questionKind,
    prompt: q.prompt,
    points: q.points,
    displayOrder: q.displayOrder,
    shuffleOptions: q.shuffleOptions,
    config: sanitizeConfig(q.questionKind, q.config),
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

// --- Cache invalidation helpers ------------------------------------------

function revalidateQuizPaths(classId: string, activityId: string) {
  revalidatePath(`/teacher/classes/${classId}`);
  revalidatePath(`/teacher/classes/${classId}/activities/${activityId}`);
  revalidatePath(`/student/classes/${classId}`);
  revalidatePath(`/student/classes/${classId}/activities/${activityId}`);
}

async function getActivityClassId(activityId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('activities')
    .select('class_id')
    .eq('id', activityId)
    .single();
  if (error) throw new Error(error.message);
  return (data as { class_id: string }).class_id;
}

// Recomputes activities.quiz_total_points after question CRUD. Cached value
// avoids a SUM(points) join on every gradebook view.
async function recomputeQuizTotalPoints(activityId: string): Promise<void> {
  const supabase = await createClient();

  const { data: rows, error: sumErr } = await supabase
    .from('quiz_questions')
    .select('points')
    .eq('activity_id', activityId);
  if (sumErr) throw new Error(sumErr.message);

  const total =
    (rows ?? []).reduce(
      (acc: number, r) => acc + Number((r as { points: number }).points),
      0,
    ) || 0;

  // Also mirror to activities.max_points so the existing gradebook code
  // (which reads max_points) shows correct totals without quiz-specific
  // logic. Same semantics: "what is the total possible score on this
  // activity".
  const { error: updErr } = await supabase
    .from('activities')
    .update({ quiz_total_points: total, max_points: total })
    .eq('id', activityId);
  if (updErr) throw new Error(updErr.message);
}

// Pulls attempt count for the lock check. Used by listQuizQuestionsForTeacher
// + write-path guards.
async function countAttempts(activityId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('quiz_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('activity_id', activityId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function assertNotLocked(activityId: string): Promise<void> {
  const n = await countAttempts(activityId);
  if (n > 0) {
    throw new Error(
      'This quiz is locked: a student has already started an attempt. ' +
        'You can still edit title, instructions, and time limit, but not the questions themselves.',
    );
  }
}

// ==========================================================================
// TEACHER: quiz creation + config
// ==========================================================================

export async function createQuizActivity(input: {
  classId: string;
  term: ModuleTerm;
  title: string;
  description?: string;
  startAt?: string;
  dueAt: string;
  allowLate?: boolean;
  timeLimitMinutes?: number | null;
  shuffleQuestions?: boolean;
  autoReleaseGrade?: boolean;
  showCorrectAnswers?: boolean;
}): Promise<{ activityId: string }> {
  const supabase = await createClient();

  const { data: existing, error: orderErr } = await supabase
    .from('activities')
    .select('display_order')
    .eq('class_id', input.classId)
    .eq('term', input.term)
    .order('display_order', { ascending: false })
    .limit(1);
  if (orderErr) throw new Error(orderErr.message);
  const nextOrder =
    existing && existing.length > 0
      ? (existing[0] as { display_order: number }).display_order + 1
      : 0;

  const submissionType: SubmissionType = 'none';

  const { data, error } = await supabase
    .from('activities')
    .insert({
      class_id: input.classId,
      term: input.term,
      activity_kind: 'quiz',
      title: input.title.trim(),
      instructions: input.description ?? '',
      prompt: '', // quizzes don't use the assignment 2-field model
      max_points: 0, // updated as questions are added via recomputeQuizTotalPoints
      start_at: input.startAt ?? new Date().toISOString(),
      due_at: input.dueAt,
      allow_late: input.allowLate ?? false,
      allow_resubmission: false, // single-attempt model in 8b
      submission_type: submissionType,
      display_order: nextOrder,
      published: false,
      time_limit_minutes: input.timeLimitMinutes ?? null,
      shuffle_questions: input.shuffleQuestions ?? false,
      auto_release_grade: input.autoReleaseGrade ?? false,
      show_correct_answers: input.showCorrectAnswers ?? false,
      quiz_total_points: 0,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  revalidatePath(`/teacher/classes/${input.classId}`);
  return { activityId: (data as { id: string }).id };
}

export async function updateQuizConfig(
  activityId: string,
  patch: Partial<QuizConfig>,
): Promise<void> {
  const supabase = await createClient();

  const dbPatch: Record<string, unknown> = {};
  if (patch.timeLimitMinutes !== undefined)
    dbPatch.time_limit_minutes = patch.timeLimitMinutes;
  if (patch.shuffleQuestions !== undefined)
    dbPatch.shuffle_questions = patch.shuffleQuestions;
  if (patch.autoReleaseGrade !== undefined)
    dbPatch.auto_release_grade = patch.autoReleaseGrade;
  if (patch.showCorrectAnswers !== undefined)
    dbPatch.show_correct_answers = patch.showCorrectAnswers;

  if (Object.keys(dbPatch).length === 0) return;

  const { data, error } = await supabase
    .from('activities')
    .update(dbPatch)
    .eq('id', activityId)
    .select('class_id')
    .single();
  if (error) throw new Error(error.message);

  revalidateQuizPaths((data as { class_id: string }).class_id, activityId);
}

// ==========================================================================
// TEACHER: question CRUD
// ==========================================================================

export async function getTeacherQuizView(
  activityId: string,
): Promise<TeacherQuizView> {
  const supabase = await createClient();

  const { data: actData, error: actErr } = await supabase
    .from('activities')
    .select(
      'id, class_id, activity_kind, time_limit_minutes, shuffle_questions, auto_release_grade, show_correct_answers, quiz_total_points',
    )
    .eq('id', activityId)
    .single();
  if (actErr) throw new Error(actErr.message);

  const actRow = actData as ActivityQuizRow;
  if (actRow.activity_kind !== 'quiz') {
    throw new Error('Activity is not a quiz');
  }

  const [{ data: questionRows, error: qErr }, attemptCount] = await Promise.all(
    [
      supabase
        .from('quiz_questions')
        .select('*')
        .eq('activity_id', activityId)
        .order('display_order', { ascending: true }),
      countAttempts(activityId),
    ],
  );
  if (qErr) throw new Error(qErr.message);

  const questions = (questionRows ?? []).map((r) =>
    mapQuestion(r as QuestionRow),
  );

  return {
    activityId,
    config: mapActivityToQuizConfig(actRow),
    questions,
    questionsLocked: attemptCount > 0,
    attemptCount,
  };
}

export async function createQuizQuestion(input: {
  activityId: string;
  questionKind: QuestionKind;
  prompt?: string;
  points?: number;
  shuffleOptions?: boolean;
  config?: QuestionConfig;
}): Promise<{ questionId: string }> {
  await assertNotLocked(input.activityId);

  const supabase = await createClient();

  const { data: existing, error: orderErr } = await supabase
    .from('quiz_questions')
    .select('display_order')
    .eq('activity_id', input.activityId)
    .order('display_order', { ascending: false })
    .limit(1);
  if (orderErr) throw new Error(orderErr.message);
  const nextOrder =
    existing && existing.length > 0
      ? (existing[0] as { display_order: number }).display_order + 1
      : 0;

  const config = input.config ?? defaultConfigFor(input.questionKind);

  const { data, error } = await supabase
    .from('quiz_questions')
    .insert({
      activity_id: input.activityId,
      question_kind: input.questionKind,
      prompt: input.prompt ?? '',
      points: input.points ?? 1,
      display_order: nextOrder,
      shuffle_options: input.shuffleOptions ?? false,
      config,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  await recomputeQuizTotalPoints(input.activityId);
  revalidateQuizPaths(
    await getActivityClassId(input.activityId),
    input.activityId,
  );
  return { questionId: (data as { id: string }).id };
}

export async function updateQuizQuestion(
  questionId: string,
  patch: {
    prompt?: string;
    points?: number;
    shuffleOptions?: boolean;
    config?: QuestionConfig;
  },
): Promise<void> {
  const supabase = await createClient();

  const { data: existing, error: getErr } = await supabase
    .from('quiz_questions')
    .select('activity_id, question_kind')
    .eq('id', questionId)
    .single();
  if (getErr) throw new Error(getErr.message);
  const row = existing as { activity_id: string; question_kind: QuestionKind };

  await assertNotLocked(row.activity_id);

  if (patch.config !== undefined) {
    const validationErr = validateQuestionConfig(row.question_kind, patch.config);
    if (validationErr) throw new Error(validationErr);
  }

  const dbPatch: Record<string, unknown> = {};
  if (patch.prompt !== undefined) dbPatch.prompt = patch.prompt;
  if (patch.points !== undefined) dbPatch.points = patch.points;
  if (patch.shuffleOptions !== undefined)
    dbPatch.shuffle_options = patch.shuffleOptions;
  if (patch.config !== undefined) dbPatch.config = patch.config;

  if (Object.keys(dbPatch).length === 0) return;

  const { error } = await supabase
    .from('quiz_questions')
    .update(dbPatch)
    .eq('id', questionId);
  if (error) throw new Error(error.message);

  if (patch.points !== undefined) {
    await recomputeQuizTotalPoints(row.activity_id);
  }
  revalidateQuizPaths(
    await getActivityClassId(row.activity_id),
    row.activity_id,
  );
}

export async function deleteQuizQuestion(questionId: string): Promise<void> {
  const supabase = await createClient();

  const { data: existing, error: getErr } = await supabase
    .from('quiz_questions')
    .select('activity_id')
    .eq('id', questionId)
    .single();
  if (getErr) throw new Error(getErr.message);
  const activityId = (existing as { activity_id: string }).activity_id;

  await assertNotLocked(activityId);

  const { error } = await supabase
    .from('quiz_questions')
    .delete()
    .eq('id', questionId);
  if (error) throw new Error(error.message);

  await recomputeQuizTotalPoints(activityId);
  revalidateQuizPaths(await getActivityClassId(activityId), activityId);
}

export async function reorderQuizQuestions(
  activityId: string,
  questionIds: string[],
): Promise<void> {
  await assertNotLocked(activityId);

  const supabase = await createClient();

  // Two-pass write to avoid colliding with the UNIQUE (activity_id, display_order)
  // index: first push everything to negative orders, then assign final values.
  // (Same pattern as reorder_activities — done client-side here because we
  // didn't add a SQL helper for quiz_questions ordering.)
  if (questionIds.length === 0) return;

  // Pass 1: temp negative orders.
  for (let i = 0; i < questionIds.length; i++) {
    const { error } = await supabase
      .from('quiz_questions')
      .update({ display_order: -(i + 1) })
      .eq('id', questionIds[i])
      .eq('activity_id', activityId);
    if (error) throw new Error(error.message);
  }

  // Pass 2: final orders.
  for (let i = 0; i < questionIds.length; i++) {
    const { error } = await supabase
      .from('quiz_questions')
      .update({ display_order: i })
      .eq('id', questionIds[i])
      .eq('activity_id', activityId);
    if (error) throw new Error(error.message);
  }

  revalidateQuizPaths(await getActivityClassId(activityId), activityId);
}

// ==========================================================================
// STUDENT: attempt flow
// ==========================================================================

export async function startQuizAttempt(activityId: string): Promise<{
  attemptId: string;
  startedAt: string;
  timeLimitMinutes: number | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('start_quiz_attempt', {
    p_activity_id: activityId,
  });
  if (error) throw new Error(error.message);

  const row = (data as Array<{
    out_attempt_id: string;
    out_started_at: string;
    out_time_limit_minutes: number | null;
  }>)[0];

  return {
    attemptId: row.out_attempt_id,
    startedAt: row.out_started_at,
    timeLimitMinutes: row.out_time_limit_minutes,
  };
}

export async function getStudentAttemptView(
  activityId: string,
): Promise<StudentAttemptView | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  if (!user) throw new Error('Not authenticated');

  // Activity quiz config.
  const { data: actData, error: actErr } = await supabase
    .from('activities')
    .select(
      'id, class_id, activity_kind, time_limit_minutes, shuffle_questions, auto_release_grade, show_correct_answers, quiz_total_points',
    )
    .eq('id', activityId)
    .single();
  if (actErr) throw new Error(actErr.message);
  const actRow = actData as ActivityQuizRow;

  // Existing attempt for this user, if any.
  const { data: attemptData, error: attemptErr } = await supabase
    .from('quiz_attempts')
    .select('*')
    .eq('activity_id', activityId)
    .eq('student_id', user.id)
    .maybeSingle();
  if (attemptErr) throw new Error(attemptErr.message);
  if (!attemptData) return null;

  const attempt = mapAttempt(attemptData as AttemptRow);

  // Questions. RLS only returns rows when the student has an in-progress
  // attempt or show_correct_answers is true post-submit.
  const { data: questionRows, error: qErr } = await supabase
    .from('quiz_questions')
    .select('*')
    .eq('activity_id', activityId)
    .order('display_order', { ascending: true });
  if (qErr) throw new Error(qErr.message);
  const questions = (questionRows ?? []).map((r) =>
    sanitizeQuestion(mapQuestion(r as QuestionRow)),
  );

  // Responses for the attempt.
  const { data: responseRows, error: rErr } = await supabase
    .from('quiz_responses')
    .select('*')
    .eq('attempt_id', attempt.id);
  if (rErr) throw new Error(rErr.message);
  const responses = (responseRows ?? []).map((r) => mapResponse(r as ResponseRow));

  // Compute deadline if time-limited.
  let deadlineAt: string | null = null;
  if (actRow.time_limit_minutes != null) {
    const startMs = new Date(attempt.startedAt).getTime();
    const deadlineMs = startMs + actRow.time_limit_minutes * 60_000;
    deadlineAt = new Date(deadlineMs).toISOString();
  }

  return {
    attempt,
    config: mapActivityToQuizConfig(actRow),
    questions,
    responses,
    deadlineAt,
  };
}

// Upsert a single response. Idempotent — used by save-as-you-go in the
// student attempt UI. RLS enforces own-attempt + not-yet-submitted.
export async function upsertQuizResponse(input: {
  attemptId: string;
  questionId: string;
  answer: QuestionAnswer;
}): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from('quiz_responses').upsert(
    {
      attempt_id: input.attemptId,
      question_id: input.questionId,
      answer: input.answer,
    },
    { onConflict: 'attempt_id,question_id' },
  );
  if (error) throw new Error(error.message);
  // No revalidation: this fires on every keystroke / option click.
  // Server reads of the attempt re-pull responses fresh.
}

export async function submitQuizAttempt(attemptId: string): Promise<{
  score: number;
  maxScore: number;
  submissionId: string;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('submit_quiz_attempt', {
    p_attempt_id: attemptId,
  });
  if (error) throw new Error(error.message);

  const row = (data as Array<{
    out_score: string | number;
    out_max_score: string | number;
    out_submission_id: string;
  }>)[0];

  // Look up classId/activityId for revalidate; cheap because attempt is small.
  const { data: attemptData } = await supabase
    .from('quiz_attempts')
    .select('activity_id')
    .eq('id', attemptId)
    .single();
  if (attemptData) {
    const activityId = (attemptData as { activity_id: string }).activity_id;
    revalidateQuizPaths(await getActivityClassId(activityId), activityId);
  }

  return {
    score: Number(row.out_score),
    maxScore: Number(row.out_max_score),
    submissionId: row.out_submission_id,
  };
}

// ==========================================================================
// TEACHER: grading views
// ==========================================================================

// Returns one row per attempt for this quiz, augmented with the fields the
// attempts-panel UI needs for at-a-glance triage:
//   - studentName / studentEmail from profiles
//   - needsManualReview: at least one essay or short_answer response on
//     this attempt has manual_points = null AND the attempt is submitted
//   - hasGrade: an activity_grades row exists for this attempt's submission
//   - gradeReleasedAt: when that grade was released, null if unreleased
//   - displayScore: what the student would see right now (manual override
//     if set, else auto_score, else null)
//
// Strategy: fetch attempts → batch-fetch profiles, all essay/short-answer
// question ids for this quiz, all responses for these attempt ids, all
// grades for these submission ids. Then derive per-attempt fields in
// memory. Three round trips total (plus the initial attempts query).
export async function listQuizAttemptsForQuiz(
  activityId: string,
): Promise<QuizAttemptListItem[]> {
  const supabase = await createClient();

  const { data: attemptRows, error: aErr } = await supabase
    .from('quiz_attempts')
    .select('*')
    .eq('activity_id', activityId)
    .order('submitted_at', { ascending: false, nullsFirst: false });
  if (aErr) throw new Error(aErr.message);

  const attempts = (attemptRows ?? []).map((r) => mapAttempt(r as AttemptRow));
  if (attempts.length === 0) return [];

  const studentIds = Array.from(new Set(attempts.map((a) => a.studentId)));
  const attemptIds = attempts.map((a) => a.id);
  const submissionIds = attempts
    .map((a) => a.submissionId)
    .filter((s): s is string => s !== null);

  // Manual-review-eligible question kinds for this quiz.
  const { data: manualQuestionRows, error: mqErr } = await supabase
    .from('quiz_questions')
    .select('id')
    .eq('activity_id', activityId)
    .in('question_kind', ['essay', 'short_answer']);
  if (mqErr) throw new Error(mqErr.message);
  const manualQuestionIds = new Set(
    (manualQuestionRows ?? []).map((r) => (r as { id: string }).id),
  );

  // Profiles for student name/email.
  const { data: profileRows, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', studentIds);
  if (pErr) throw new Error(pErr.message);

  const profileById = new Map<
    string,
    { full_name: string | null; email: string | null }
  >();
  for (const p of (profileRows ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
  }>) {
    profileById.set(p.id, { full_name: p.full_name, email: p.email });
  }

  // Responses for all attempts (only the columns we need for derivation).
  // If there are no manual-graded question kinds in the quiz at all,
  // skip this fetch — needsManualReview will be false for every attempt.
  type DerivedFlags = { needsManualReview: boolean };
  const derivedByAttempt = new Map<string, DerivedFlags>();
  for (const a of attempts) {
    // Pre-submit attempts are not in "needs review" — they're in progress.
    derivedByAttempt.set(a.id, { needsManualReview: false });
  }

  if (manualQuestionIds.size > 0 && attemptIds.length > 0) {
    const { data: respRows, error: rErr } = await supabase
      .from('quiz_responses')
      .select('attempt_id, question_id, manual_points')
      .in('attempt_id', attemptIds);
    if (rErr) throw new Error(rErr.message);

    type RespLite = {
      attempt_id: string;
      question_id: string;
      manual_points: string | number | null;
    };
    for (const r of (respRows ?? []) as RespLite[]) {
      if (!manualQuestionIds.has(r.question_id)) continue;
      if (r.manual_points !== null) continue;
      const flags = derivedByAttempt.get(r.attempt_id);
      if (flags) flags.needsManualReview = true;
    }
    // Suppress needsManualReview for in-progress attempts — only submitted
    // attempts are in the grading queue.
    for (const a of attempts) {
      if (!a.submittedAt) {
        const flags = derivedByAttempt.get(a.id);
        if (flags) flags.needsManualReview = false;
      }
    }
  }

  // Grades for the submission ids.
  type GradeRow = {
    submission_id: string;
    returned_at: string | null;
  };
  const gradeBySubmission = new Map<string, GradeRow>();
  if (submissionIds.length > 0) {
    const { data: gradeRows, error: gErr } = await supabase
      .from('activity_grades')
      .select('submission_id, returned_at')
      .in('submission_id', submissionIds);
    if (gErr) throw new Error(gErr.message);
    for (const g of (gradeRows ?? []) as GradeRow[]) {
      gradeBySubmission.set(g.submission_id, g);
    }
  }

  return attempts.map((a) => {
    const profile = profileById.get(a.studentId);
    const flags = derivedByAttempt.get(a.id);
    const grade = a.submissionId
      ? gradeBySubmission.get(a.submissionId) ?? null
      : null;
    const displayScore =
      a.manualScoreOverride !== null
        ? a.manualScoreOverride
        : a.autoScore !== null
          ? a.autoScore
          : null;
    return {
      ...a,
      studentName: profile?.full_name ?? null,
      studentEmail: profile?.email ?? null,
      needsManualReview: flags?.needsManualReview ?? false,
      hasGrade: grade !== null,
      gradeReleasedAt: grade?.returned_at ?? null,
      displayScore,
    };
  });
}

export async function getAttemptForGrading(
  attemptId: string,
): Promise<AttemptForGradingView> {
  const supabase = await createClient();

  const { data: attemptData, error: aErr } = await supabase
    .from('quiz_attempts')
    .select('*')
    .eq('id', attemptId)
    .single();
  if (aErr) throw new Error(aErr.message);

  const attempt = mapAttempt(attemptData as AttemptRow);

  // Pull the activity-level fields the grader UI needs.
  const { data: actData, error: actErr } = await supabase
    .from('activities')
    .select(
      'class_id, title, due_at, auto_release_grade, quiz_total_points',
    )
    .eq('id', attempt.activityId)
    .single();
  if (actErr) throw new Error(actErr.message);
  const actRow = actData as {
    class_id: string;
    title: string;
    due_at: string;
    auto_release_grade: boolean;
    quiz_total_points: string | number | null;
  };

  const [
    { data: questionRows, error: qErr },
    { data: responseRows, error: rErr },
    { data: profileRow, error: pErr },
  ] = await Promise.all([
    supabase
      .from('quiz_questions')
      .select('*')
      .eq('activity_id', attempt.activityId)
      .order('display_order', { ascending: true }),
    supabase.from('quiz_responses').select('*').eq('attempt_id', attemptId),
    supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', attempt.studentId)
      .single(),
  ]);
  if (qErr) throw new Error(qErr.message);
  if (rErr) throw new Error(rErr.message);
  if (pErr) throw new Error(pErr.message);

  const questions = (questionRows ?? []).map((r) =>
    mapQuestion(r as QuestionRow),
  );
  const responses = (responseRows ?? []).map((r) =>
    mapResponse(r as ResponseRow),
  );
  const profile = profileRow as {
    full_name: string | null;
    email: string | null;
  };

  // Grade row (for gradeReleasedAt).
  let gradeReleasedAt: string | null = null;
  if (attempt.submissionId) {
    const { data: gradeRow, error: gErr } = await supabase
      .from('activity_grades')
      .select('returned_at')
      .eq('submission_id', attempt.submissionId)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    gradeReleasedAt = (gradeRow as { returned_at: string | null } | null)
      ?.returned_at ?? null;
  }

  const currentScore =
    attempt.manualScoreOverride !== null
      ? attempt.manualScoreOverride
      : attempt.autoScore !== null
        ? attempt.autoScore
        : 0;

  return {
    attempt,
    activityId: attempt.activityId,
    classId: actRow.class_id,
    activityTitle: actRow.title,
    activityDueAt: actRow.due_at,
    studentId: attempt.studentId,
    studentName: profile?.full_name ?? null,
    studentEmail: profile?.email ?? null,
    questions,
    responses,
    quizTotalPoints: Number(actRow.quiz_total_points ?? 0),
    autoReleaseGrade: actRow.auto_release_grade,
    currentScore,
    gradeReleasedAt,
  };
}

export async function setManualResponseGrade(input: {
  responseId: string;
  manualPoints: number | null;
  feedback?: string;
}): Promise<void> {
  const supabase = await createClient();

  const dbPatch: Record<string, unknown> = {
    manual_points: input.manualPoints,
  };
  if (input.feedback !== undefined) dbPatch.feedback = input.feedback;

  const { error } = await supabase
    .from('quiz_responses')
    .update(dbPatch)
    .eq('id', input.responseId);
  if (error) throw new Error(error.message);
  // Revalidation deferred to the caller's recomputeQuizScore call.
}

export async function recomputeQuizScore(
  attemptId: string,
): Promise<{ score: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('recompute_quiz_score', {
    p_attempt_id: attemptId,
  });
  if (error) throw new Error(error.message);

  // Look up classId/activityId for revalidate.
  const { data: attemptData } = await supabase
    .from('quiz_attempts')
    .select('activity_id')
    .eq('id', attemptId)
    .single();
  if (attemptData) {
    const activityId = (attemptData as { activity_id: string }).activity_id;
    revalidateQuizPaths(await getActivityClassId(activityId), activityId);
  }

  return { score: Number(data) || 0 };
}

// Attempt-level feedback (the overall note that appears alongside the score
// after release). Per-question feedback lives on quiz_responses.feedback.
// We keep this as a tiny standalone action so the grader can call it in
// parallel with setManualResponseGrade writes without churning the per-row
// update path. No revalidation here — the grader's recomputeQuizScore call
// handles it for the whole attempt.
export async function setAttemptFeedback(
  attemptId: string,
  feedback: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('quiz_attempts')
    .update({ feedback })
    .eq('id', attemptId);
  if (error) throw new Error(error.message);
}

// ==========================================================================
// STUDENT: post-submit review (C4)
// ==========================================================================

export interface StudentReviewView {
  attempt: QuizAttempt;
  config: QuizConfig;
  questions: QuizQuestion[];
  responses: QuizResponse[];
  score: number;
  maxScore: number;
}

export async function getStudentReviewView(
  activityId: string,
): Promise<StudentReviewView> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  if (!user) throw new Error('Not authenticated');

  const { data: actData, error: actErr } = await supabase
    .from('activities')
    .select(
      'id, class_id, activity_kind, time_limit_minutes, shuffle_questions, auto_release_grade, show_correct_answers, quiz_total_points',
    )
    .eq('id', activityId)
    .single();
  if (actErr) throw new Error(actErr.message);
  const actRow = actData as ActivityQuizRow;
  if (actRow.activity_kind !== 'quiz') {
    throw new Error('Activity is not a quiz');
  }
  if (!actRow.show_correct_answers) {
    throw new Error('Detailed review is not available for this quiz.');
  }

  const { data: attemptData, error: attemptErr } = await supabase
    .from('quiz_attempts')
    .select('*')
    .eq('activity_id', activityId)
    .eq('student_id', user.id)
    .maybeSingle();
  if (attemptErr) throw new Error(attemptErr.message);
  if (!attemptData) throw new Error('No attempt found for this quiz.');
  const attempt = mapAttempt(attemptData as AttemptRow);
  if (!attempt.submittedAt) {
    throw new Error('Attempt has not been submitted yet.');
  }

  const [
    { data: questionRows, error: qErr },
    { data: responseRows, error: rErr },
  ] = await Promise.all([
    supabase
      .from('quiz_questions')
      .select('*')
      .eq('activity_id', activityId)
      .order('display_order', { ascending: true }),
    supabase.from('quiz_responses').select('*').eq('attempt_id', attempt.id),
  ]);
  if (qErr) throw new Error(qErr.message);
  if (rErr) throw new Error(rErr.message);

  const questions = (questionRows ?? []).map((r) => mapQuestion(r as QuestionRow));
  const responses = (responseRows ?? []).map((r) => mapResponse(r as ResponseRow));

  const score =
    attempt.manualScoreOverride !== null
      ? attempt.manualScoreOverride
      : attempt.autoScore !== null
        ? attempt.autoScore
        : 0;
  const maxScore = Number(actRow.quiz_total_points ?? 0);

  return {
    attempt,
    config: mapActivityToQuizConfig(actRow),
    questions,
    responses,
    score,
    maxScore,
  };
}