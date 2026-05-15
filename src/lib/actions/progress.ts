
// src/lib/actions/progress.ts
//
// Activity progress server actions.
//
// Design (locked in C-session, 2026-05-15):
//   "Done" = a row exists in activity_submissions for (activity_id, student_id).
//   This works for BOTH assignments and quizzes because submit_quiz_attempt
//   creates an activity_submissions row on quiz submit (see
//   supabase/migrations/20260510050000_quiz_attempts.sql, lifecycle step 3).
//
// Scope:
//   - Activities are grouped by `term`, not by module (activities table has
//     no module_id column).
//   - Only PUBLISHED activities count toward numerator/denominator.
//   - One submission per (activity, student) — guaranteed by the UNIQUE
//     constraint on activity_submissions.

'use server';

import { createClient } from '@/lib/supabase/server';
import type { ModuleTerm } from '@/lib/types/modules';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface TermProgress {
  term: ModuleTerm;
  done: number;
  total: number;
}

export interface StudentClassProgress {
  classId: string;
  studentId: string;
  overall: { done: number; total: number };
  byTerm: TermProgress[];
}

export interface ActivitySubmissionStat {
  activityId: string;
  title: string;
  term: ModuleTerm;
  activityKind: 'assignment' | 'quiz';
  submittedCount: number;
  totalStudents: number;
}

export interface TeacherClassProgress {
  classId: string;
  enrolledStudents: number;
  overall: { totalActivities: number; avgCompletionPct: number };
  byTerm: Array<{
    term: ModuleTerm;
    totalActivities: number;
    totalSubmissions: number;
    possibleSubmissions: number; // activities * students
    avgCompletionPct: number;
  }>;
  perActivity: ActivitySubmissionStat[];
}

// ---------------------------------------------------------------------------
// Internal helper — empty-state per-term shape so the UI always has 4 entries
// ---------------------------------------------------------------------------

const TERMS: ModuleTerm[] = ['prelim', 'midterm', 'prefinal', 'final'];

function emptyTermMap<T>(defaultVal: () => T): Record<ModuleTerm, T> {
  return {
    prelim: defaultVal(),
    midterm: defaultVal(),
    prefinal: defaultVal(),
    final: defaultVal(),
  };
}

// ---------------------------------------------------------------------------
// Action 1: Student's own progress for a class
// ---------------------------------------------------------------------------

export async function getStudentClassProgress(
  classId: string,
): Promise<StudentClassProgress> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error('Not authenticated');

  // Fetch all published activities in this class — id + term only
  const { data: activities, error: actErr } = await supabase
    .from('activities')
    .select('id, term')
    .eq('class_id', classId)
    .eq('published', true);

  if (actErr) throw new Error(actErr.message);

  const activityRows = (activities ?? []) as Array<{ id: string; term: ModuleTerm }>;
  const activityIds = activityRows.map((a) => a.id);

  // Fetch this student's submission rows for these activities
  let submittedIds = new Set<string>();
  if (activityIds.length > 0) {
    const { data: subs, error: subErr } = await supabase
      .from('activity_submissions')
      .select('activity_id')
      .eq('student_id', user.id)
      .in('activity_id', activityIds);

    if (subErr) throw new Error(subErr.message);

    submittedIds = new Set(
      (subs ?? []).map((s) => (s as { activity_id: string }).activity_id),
    );
  }

  // Aggregate per term
  const totals = emptyTermMap(() => ({ done: 0, total: 0 }));
  for (const a of activityRows) {
    totals[a.term].total += 1;
    if (submittedIds.has(a.id)) totals[a.term].done += 1;
  }

  const byTerm: TermProgress[] = TERMS.map((t) => ({
    term: t,
    done: totals[t].done,
    total: totals[t].total,
  }));

  const overall = {
    done: byTerm.reduce((s, t) => s + t.done, 0),
    total: byTerm.reduce((s, t) => s + t.total, 0),
  };

  return {
    classId,
    studentId: user.id,
    overall,
    byTerm,
  };
}

// ---------------------------------------------------------------------------
// Action 2: Teacher's aggregate view for a class
// ---------------------------------------------------------------------------

export async function getTeacherClassProgress(
  classId: string,
): Promise<TeacherClassProgress> {
  const supabase = await createClient();

  // Enrolled student count
  const { count: enrolledCount, error: enrErr } = await supabase
    .from('class_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId);

  if (enrErr) throw new Error(enrErr.message);
  const enrolledStudents = enrolledCount ?? 0;

  // Published activities (id, term, title, kind)
  const { data: activities, error: actErr } = await supabase
    .from('activities')
    .select('id, term, title, activity_kind')
    .eq('class_id', classId)
    .eq('published', true);

  if (actErr) throw new Error(actErr.message);

  const activityRows = (activities ?? []) as Array<{
    id: string;
    term: ModuleTerm;
    title: string;
    activity_kind: 'assignment' | 'quiz';
  }>;
  const activityIds = activityRows.map((a) => a.id);

  // Submission counts per activity
  const submissionCountMap = new Map<string, number>();
  if (activityIds.length > 0) {
    const { data: subs, error: subErr } = await supabase
      .from('activity_submissions')
      .select('activity_id')
      .in('activity_id', activityIds);

    if (subErr) throw new Error(subErr.message);

    for (const row of subs ?? []) {
      const aid = (row as { activity_id: string }).activity_id;
      submissionCountMap.set(aid, (submissionCountMap.get(aid) ?? 0) + 1);
    }
  }

  // Per-activity stats
  const perActivity: ActivitySubmissionStat[] = activityRows.map((a) => ({
    activityId: a.id,
    title: a.title,
    term: a.term,
    activityKind: a.activity_kind,
    submittedCount: submissionCountMap.get(a.id) ?? 0,
    totalStudents: enrolledStudents,
  }));

  // Per-term aggregate
  const termTotals = emptyTermMap(() => ({
    totalActivities: 0,
    totalSubmissions: 0,
  }));
  for (const a of activityRows) {
    termTotals[a.term].totalActivities += 1;
    termTotals[a.term].totalSubmissions += submissionCountMap.get(a.id) ?? 0;
  }

  const byTerm = TERMS.map((t) => {
    const possibleSubmissions =
      termTotals[t].totalActivities * enrolledStudents;
    const avgCompletionPct =
      possibleSubmissions > 0
        ? Math.round(
            (termTotals[t].totalSubmissions / possibleSubmissions) * 100,
          )
        : 0;
    return {
      term: t,
      totalActivities: termTotals[t].totalActivities,
      totalSubmissions: termTotals[t].totalSubmissions,
      possibleSubmissions,
      avgCompletionPct,
    };
  });

  // Overall
  const totalActivities = activityRows.length;
  const possibleSubmissionsOverall = totalActivities * enrolledStudents;
  const totalSubmissionsOverall = Array.from(
    submissionCountMap.values(),
  ).reduce((s, n) => s + n, 0);
  const avgCompletionPctOverall =
    possibleSubmissionsOverall > 0
      ? Math.round(
          (totalSubmissionsOverall / possibleSubmissionsOverall) * 100,
        )
      : 0;

  return {
    classId,
    enrolledStudents,
    overall: {
      totalActivities,
      avgCompletionPct: avgCompletionPctOverall,
    },
    byTerm,
    perActivity,
  };
}

// ---------------------------------------------------------------------------
// Action 3: One student's progress as seen by the teacher (drill-down)
// ---------------------------------------------------------------------------

export async function getStudentProgressForTeacher(
  classId: string,
  studentId: string,
): Promise<StudentClassProgress> {
  const supabase = await createClient();

  const { data: activities, error: actErr } = await supabase
    .from('activities')
    .select('id, term')
    .eq('class_id', classId)
    .eq('published', true);

  if (actErr) throw new Error(actErr.message);

  const activityRows = (activities ?? []) as Array<{ id: string; term: ModuleTerm }>;
  const activityIds = activityRows.map((a) => a.id);

  let submittedIds = new Set<string>();
  if (activityIds.length > 0) {
    const { data: subs, error: subErr } = await supabase
      .from('activity_submissions')
      .select('activity_id')
      .eq('student_id', studentId)
      .in('activity_id', activityIds);

    if (subErr) throw new Error(subErr.message);

    submittedIds = new Set(
      (subs ?? []).map((s) => (s as { activity_id: string }).activity_id),
    );
  }

  const totals = emptyTermMap(() => ({ done: 0, total: 0 }));
  for (const a of activityRows) {
    totals[a.term].total += 1;
    if (submittedIds.has(a.id)) totals[a.term].done += 1;
  }

  const byTerm: TermProgress[] = TERMS.map((t) => ({
    term: t,
    done: totals[t].done,
    total: totals[t].total,
  }));

  const overall = {
    done: byTerm.reduce((s, t) => s + t.done, 0),
    total: byTerm.reduce((s, t) => s + t.total, 0),
  };

  return { classId, studentId, overall, byTerm };
}
