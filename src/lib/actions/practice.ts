// src/lib/actions/practice.ts
//
// Server actions for the AI Practice feature. Students own everything;
// RLS scopes all rows to the current user. Actions throw on failure
// rather than returning ActionResult — they're called from server pages
// that handle their own try/catch (same pattern as enrollments.ts).
//
// CREATE flow is split between the API route (which calls the AI and
// computes the question list) and createPracticeSession here (which
// persists the result). This mirrors the quiz_generate route: AI on the
// route side, DB on the action side.

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { gradeAnswer } from '@/lib/types/practice';
import type {
  PracticeAttempt,
  PracticeAttemptInProgress,
  PracticeAttemptResponse,
  PracticeDifficulty,
  PracticeQuestion,
  PracticeQuestionConfig,
  PracticeQuestionKind,
  PracticeSession,
  PracticeSessionDetail,
  PracticeSessionListItem,
  PracticeSourceKind,
} from '@/lib/types/practice';
import type { QuestionAnswer } from '@/lib/types/quizzes';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

async function requireStudent() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect('/');
  return { supabase, userId: user.id };
}

// snake_case → camelCase mappers. Kept inline so the file is
// self-contained; matches the convention used in enrollments.ts.

interface SessionDbRow {
  id: string;
  student_id: string;
  title: string;
  source_kind: PracticeSourceKind;
  source_lesson_id: string | null;
  source_file_names: string[];
  source_note: string | null;
  difficulty: PracticeDifficulty;
  requested_count: number;
  model_used: string | null;
  tokens_used: number | null;
  created_at: string;
  updated_at: string;
}

function mapSession(r: SessionDbRow): PracticeSession {
  return {
    id: r.id,
    studentId: r.student_id,
    title: r.title,
    sourceKind: r.source_kind,
    sourceLessonId: r.source_lesson_id,
    sourceFileNames: r.source_file_names ?? [],
    sourceNote: r.source_note,
    difficulty: r.difficulty,
    requestedCount: r.requested_count,
    modelUsed: r.model_used,
    tokensUsed: r.tokens_used,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

interface QuestionDbRow {
  id: string;
  session_id: string;
  question_kind: PracticeQuestionKind;
  prompt: string;
  points: number;
  display_order: number;
  config: PracticeQuestionConfig;
  explanation: string | null;
  created_at: string;
}

function mapQuestion(r: QuestionDbRow): PracticeQuestion {
  return {
    id: r.id,
    sessionId: r.session_id,
    questionKind: r.question_kind,
    prompt: r.prompt,
    points: r.points,
    displayOrder: r.display_order,
    config: r.config,
    explanation: r.explanation,
    createdAt: r.created_at,
  };
}

interface AttemptDbRow {
  id: string;
  session_id: string;
  student_id: string;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  max_score: number | null;
  responses: PracticeAttemptResponse[];
  created_at: string;
  updated_at: string;
}

function mapAttempt(r: AttemptDbRow): PracticeAttempt {
  return {
    id: r.id,
    sessionId: r.session_id,
    studentId: r.student_id,
    startedAt: r.started_at,
    submittedAt: r.submitted_at,
    score: r.score,
    maxScore: r.max_score,
    responses: r.responses ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// --------------------------------------------------------------------------
// CREATE — called by the AI route after generation succeeds
// --------------------------------------------------------------------------

export interface CreatePracticeSessionInput {
  title: string;
  sourceKind: PracticeSourceKind;
  sourceLessonId: string | null;
  sourceFileNames: string[];
  sourceNote: string | null;
  difficulty: PracticeDifficulty;
  requestedCount: number;
  modelUsed: string | null;
  tokensUsed: number | null;
  questions: Array<{
    kind: PracticeQuestionKind;
    prompt: string;
    points: number;
    config: PracticeQuestionConfig;
    explanation: string | null;
  }>;
}

export async function createPracticeSession(
  input: CreatePracticeSessionInput,
): Promise<{ sessionId: string; insertedCount: number }> {
  const { supabase, userId } = await requireStudent();

  if (input.questions.length === 0) {
    throw new Error('Cannot create a session with no questions');
  }
  if (input.questions.length > 25) {
    throw new Error('Too many questions');
  }

  // Insert the session first; we need its id for the questions.
  const { data: sessionData, error: sessionErr } = await supabase
    .from('practice_sessions')
    .insert({
      student_id: userId,
      title: input.title.trim() || 'Untitled practice',
      source_kind: input.sourceKind,
      source_lesson_id: input.sourceLessonId,
      source_file_names: input.sourceFileNames,
      source_note: input.sourceNote,
      difficulty: input.difficulty,
      requested_count: input.requestedCount,
      model_used: input.modelUsed,
      tokens_used: input.tokensUsed,
    })
    .select('id')
    .single();
  if (sessionErr || !sessionData) {
    throw new Error(
      `Failed to create session: ${sessionErr?.message ?? 'no data'}`,
    );
  }
  const sessionId = sessionData.id as string;

  // Bulk insert questions in the order the AI returned them.
  const questionRows = input.questions.map((q, idx) => ({
    session_id: sessionId,
    question_kind: q.kind,
    prompt: q.prompt.trim(),
    points: q.points,
    display_order: idx,
    config: q.config,
    explanation: q.explanation,
  }));
  const { error: questionsErr } = await supabase
    .from('practice_questions')
    .insert(questionRows);
  if (questionsErr) {
    // Best-effort cleanup so we don't leave an orphan session with zero
    // questions. RLS lets the owner delete.
    await supabase.from('practice_sessions').delete().eq('id', sessionId);
    throw new Error(`Failed to save questions: ${questionsErr.message}`);
  }

  revalidatePath('/student/practice');
  return { sessionId, insertedCount: input.questions.length };
}

// --------------------------------------------------------------------------
// READS
// --------------------------------------------------------------------------

export async function listMyPracticeSessions(): Promise <
  PracticeSessionListItem[]
> {
  const { supabase, userId } = await requireStudent();

  const { data: sessionRows, error: sessionErr } = await supabase
    .from('practice_sessions')
    .select('*')
    .eq('student_id', userId)
    .order('created_at', { ascending: false });
  if (sessionErr) {
    throw new Error(`Failed to list sessions: ${sessionErr.message}`);
  }
  const sessions = (sessionRows ?? []) as SessionDbRow[];
  if (sessions.length === 0) return [];
  const sessionIds = sessions.map((s) => s.id);

  // Pull per-session question counts and attempt summaries in two
  // batched queries rather than N+1 fetches.
  const [questionCountsRes, attemptsRes] = await Promise.all([
    supabase
      .from('practice_questions')
      .select('session_id')
      .in('session_id', sessionIds),
    supabase
      .from('practice_attempts')
      .select('session_id, score, max_score, submitted_at')
      .in('session_id', sessionIds)
      .not('submitted_at', 'is', null),
  ]);
  if (questionCountsRes.error) {
    throw new Error(
      `Failed to load question counts: ${questionCountsRes.error.message}`,
    );
  }
  if (attemptsRes.error) {
    throw new Error(`Failed to load attempts: ${attemptsRes.error.message}`);
  }

  const questionCountBySession = new Map<string, number>();
  for (const row of (questionCountsRes.data ?? []) as Array<{
    session_id: string;
  }>) {
    questionCountBySession.set(
      row.session_id,
      (questionCountBySession.get(row.session_id) ?? 0) + 1,
    );
  }

  // Aggregate attempt summaries: count, best score, last attempted time.
  type AttemptSummary = {
    count: number;
    bestScore: number | null;
    bestMaxScore: number | null;
    lastAttemptedAt: string | null;
  };
  const attemptSummary = new Map<string, AttemptSummary>();
  for (const row of (attemptsRes.data ?? []) as Array<{
    session_id: string;
    score: number | null;
    max_score: number | null;
    submitted_at: string;
  }>) {
    const s = attemptSummary.get(row.session_id) ?? {
      count: 0,
      bestScore: null,
      bestMaxScore: null,
      lastAttemptedAt: null,
    };
    s.count += 1;
    // Best score: highest absolute score (max_score should be stable per
    // session, but we capture both just in case the question count ever
    // changes — defensive).
    if (
      row.score !== null &&
      (s.bestScore === null || row.score > s.bestScore)
    ) {
      s.bestScore = row.score;
      s.bestMaxScore = row.max_score;
    }
    if (
      row.submitted_at &&
      (!s.lastAttemptedAt || row.submitted_at > s.lastAttemptedAt)
    ) {
      s.lastAttemptedAt = row.submitted_at;
    }
    attemptSummary.set(row.session_id, s);
  }

  return sessions.map((s) => {
    const a = attemptSummary.get(s.id);
    return {
      ...mapSession(s),
      questionCount: questionCountBySession.get(s.id) ?? 0,
      attemptCount: a?.count ?? 0,
      bestScore: a?.bestScore ?? null,
      bestMaxScore: a?.bestMaxScore ?? null,
      lastAttemptedAt: a?.lastAttemptedAt ?? null,
    };
  });
}

export async function getPracticeSession(
  sessionId: string,
): Promise<PracticeSessionDetail | null> {
  const { supabase } = await requireStudent();

  // RLS filters to the owner; if the row isn't returned we treat it as
  // "not found" rather than distinguishing 404 vs 403 (same as enrollments).
  const [sessionRes, questionsRes, attemptsRes] = await Promise.all([
    supabase
      .from('practice_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle(),
    supabase
      .from('practice_questions')
      .select('*')
      .eq('session_id', sessionId)
      .order('display_order', { ascending: true }),
    supabase
      .from('practice_attempts')
      .select('*')
      .eq('session_id', sessionId)
      .order('started_at', { ascending: false }),
  ]);

  if (sessionRes.error) {
    throw new Error(`Failed to load session: ${sessionRes.error.message}`);
  }
  if (!sessionRes.data) return null;

  if (questionsRes.error) {
    throw new Error(
      `Failed to load questions: ${questionsRes.error.message}`,
    );
  }
  if (attemptsRes.error) {
    throw new Error(`Failed to load attempts: ${attemptsRes.error.message}`);
  }

  return {
    session: mapSession(sessionRes.data as SessionDbRow),
    questions: ((questionsRes.data ?? []) as QuestionDbRow[]).map(mapQuestion),
    attempts: ((attemptsRes.data ?? []) as AttemptDbRow[]).map(mapAttempt),
  };
}

// --------------------------------------------------------------------------
// ATTEMPT FLOW
// --------------------------------------------------------------------------

// Start a fresh attempt. Returns the attempt + session + questions in one
// payload so the take-attempt page doesn't need a second round trip.
export async function startPracticeAttempt(
  sessionId: string,
): Promise<PracticeAttemptInProgress> {
  const { supabase, userId } = await requireStudent();

  // Verify the session exists + owned (RLS).
  const { data: sessionData, error: sessionErr } = await supabase
    .from('practice_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionErr) {
    throw new Error(`Failed to load session: ${sessionErr.message}`);
  }
  if (!sessionData) throw new Error('Session not found');

  // Pull questions and create the attempt in parallel.
  const [questionsRes, attemptRes] = await Promise.all([
    supabase
      .from('practice_questions')
      .select('*')
      .eq('session_id', sessionId)
      .order('display_order', { ascending: true }),
    supabase
      .from('practice_attempts')
      .insert({
        session_id: sessionId,
        student_id: userId,
        responses: [],
      })
      .select('*')
      .single(),
  ]);
  if (questionsRes.error) {
    throw new Error(
      `Failed to load questions: ${questionsRes.error.message}`,
    );
  }
  if (attemptRes.error || !attemptRes.data) {
    throw new Error(
      `Failed to start attempt: ${attemptRes.error?.message ?? 'no data'}`,
    );
  }

  return {
    session: mapSession(sessionData as SessionDbRow),
    questions: ((questionsRes.data ?? []) as QuestionDbRow[]).map(mapQuestion),
    attempt: mapAttempt(attemptRes.data as AttemptDbRow),
  };
}

export interface SubmitPracticeAttemptInput {
  attemptId: string;
  // One entry per question. Questions the student skipped should still
  // appear here with the kind's default empty answer so the response
  // count matches the question count.
  responses: Array<{
    questionId: string;
    answer: QuestionAnswer;
  }>;
}

export async function submitPracticeAttempt(
  input: SubmitPracticeAttemptInput,
): Promise<PracticeAttempt> {
  const { supabase, userId } = await requireStudent();

  // Load attempt + questions to grade against. RLS confines this to owner.
  const { data: attemptRow, error: attemptErr } = await supabase
    .from('practice_attempts')
    .select('*')
    .eq('id', input.attemptId)
    .maybeSingle();
  if (attemptErr) {
    throw new Error(`Failed to load attempt: ${attemptErr.message}`);
  }
  if (!attemptRow) throw new Error('Attempt not found');
  const attempt = attemptRow as AttemptDbRow;
  if (attempt.student_id !== userId) {
    // Defense in depth — RLS already prevents this case from reaching us.
    throw new Error('Not authorized');
  }
  if (attempt.submitted_at) {
    throw new Error('Attempt already submitted');
  }

  const { data: questionRows, error: questionsErr } = await supabase
    .from('practice_questions')
    .select('*')
    .eq('session_id', attempt.session_id)
    .order('display_order', { ascending: true });
  if (questionsErr) {
    throw new Error(`Failed to load questions: ${questionsErr.message}`);
  }
  const questions = (questionRows ?? []) as QuestionDbRow[];
  if (questions.length === 0) {
    throw new Error('Session has no questions');
  }

  // Index responses by questionId so we can grade even if the client
  // sent them in a different order.
  const responsesByQuestionId = new Map(
    input.responses.map((r) => [r.questionId, r.answer]),
  );

  let score = 0;
  let maxScore = 0;
  const responseRecords: PracticeAttemptResponse[] = [];
  for (const q of questions) {
    maxScore += q.points;
    const answer = responsesByQuestionId.get(q.id);
    if (!answer) {
      // Unanswered question — recorded as incorrect with the empty answer.
      responseRecords.push({
        questionId: q.id,
        answer: { selected: -1 } as unknown as QuestionAnswer,
        correct: false,
        points: 0,
      });
      continue;
    }
    const correct = gradeAnswer(q.question_kind, q.config, answer);
    if (correct) score += q.points;
    responseRecords.push({
      questionId: q.id,
      answer,
      correct,
      points: correct ? q.points : 0,
    });
  }

  const submittedAt = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from('practice_attempts')
    .update({
      submitted_at: submittedAt,
      score,
      max_score: maxScore,
      responses: responseRecords,
    })
    .eq('id', input.attemptId)
    .select('*')
    .single();
  if (updateErr || !updated) {
    throw new Error(`Failed to submit: ${updateErr?.message ?? 'no data'}`);
  }

  revalidatePath(`/student/practice/${attempt.session_id}`);
  revalidatePath('/student/practice');
  return mapAttempt(updated as AttemptDbRow);
}

// --------------------------------------------------------------------------
// DELETE
// --------------------------------------------------------------------------

export async function deletePracticeSession(sessionId: string): Promise<void> {
  const { supabase } = await requireStudent();
  const { error } = await supabase
    .from('practice_sessions')
    .delete()
    .eq('id', sessionId);
  if (error) throw new Error(`Failed to delete session: ${error.message}`);
  revalidatePath('/student/practice');
}

// Abandon an in-progress attempt (used if a student bails out of the
// take-flow without submitting). Hard delete; no soft-state.
export async function abandonPracticeAttempt(attemptId: string): Promise<void> {
  const { supabase } = await requireStudent();
  const { error } = await supabase
    .from('practice_attempts')
    .delete()
    .eq('id', attemptId)
    .is('submitted_at', null);
  if (error) throw new Error(`Failed to abandon attempt: ${error.message}`);
}