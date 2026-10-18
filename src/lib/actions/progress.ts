// src/lib/actions/progress.ts
//
// Activity progress server actions.
//
// "Done" = the student has at least one SUBMITTED (non-draft) row in
// activity_submissions for the activity. Drafts (is_draft = true) never count.
// This works for BOTH assignments and quizzes because submit_quiz_attempt
// creates an activity_submissions row on quiz submit.
//
// Scope:
//   - Activities are grouped by `term`, not by module (activities table has
//     no module_id column).
//   - Only PUBLISHED activities count toward numerator/denominator.
//   - A student can have several attempts per activity, so the teacher view
//     counts DISTINCT students per activity, not rows.

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
// Internal helpers
// ---------------------------------------------------------------------------

const TERMS: ModuleTerm[] = ['prelim', 'midterm', 'final'];

function emptyTermMap<T>(defaultVal: () => T): Record<ModuleTerm, T> {
  return {
    prelim: defaultVal(),
    midterm: defaultVal(),
    prefinal: defaultVal(),
    final: defaultVal(),
  };
}

/** Set of activity ids this student has actually SUBMITTED (drafts excluded). */
async function getSubmittedActivityIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
  activityIds: string[],
): Promise<Set<string>> {
  if (activityIds.length === 0) return new Set();

  const { data: subs, error } = await supabase
    .from('activity_submissions')
    .select('activity_id')
    .eq('student_id', studentId)
    .eq('is_draft', false)
    .in('activity_id', activityIds);

  if (error) throw new Error(error.message);

  return new Set(
    (subs ?? []).map((s) => (s as { activity_id: string }).activity_id),
  );
}

function buildStudentProgress(
  classId: string,
  studentId: string,
  activityRows: Array<{ id: string; term: ModuleTerm }>,
  submittedIds: Set<string>,
): StudentClassProgress {
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

  const { data: activities, error: actErr } = await supabase
    .from('activities')
    .select('id, term')
    .eq('class_id', classId)
    .eq('published', true);

  if (actErr) throw new Error(actErr.message);

  const activityRows = (activities ?? []) as Array<{ id: string; term: ModuleTerm }>;
  const submittedIds = await getSubmittedActivityIds(
    supabase,
    user.id,
    activityRows.map((a) => a.id),
  );

  return buildStudentProgress(classId, user.id, activityRows, submittedIds);
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

  // Distinct students who SUBMITTED (not drafts) per activity
  const studentsByActivity = new Map<string, Set<string>>();
  if (activityIds.length > 0) {
    const { data: subs, error: subErr } = await supabase
      .from('activity_submissions')
      .select('activity_id, student_id')
      .eq('is_draft', false)
      .in('activity_id', activityIds);

    if (subErr) throw new Error(subErr.message);

    for (const row of subs ?? []) {
      const r = row as { activity_id: string; student_id: string };
      const set = studentsByActivity.get(r.activity_id) ?? new Set<string>();
      set.add(r.student_id);
      studentsByActivity.set(r.activity_id, set);
    }
  }

  const submittedCount = (activityId: string) =>
    studentsByActivity.get(activityId)?.size ?? 0;

  // Per-activity stats
  const perActivity: ActivitySubmissionStat[] = activityRows.map((a) => ({
    activityId: a.id,
    title: a.title,
    term: a.term,
    activityKind: a.activity_kind,
    submittedCount: submittedCount(a.id),
    totalStudents: enrolledStudents,
  }));

  // Per-term aggregate
  const termTotals = emptyTermMap(() => ({
    totalActivities: 0,
    totalSubmissions: 0,
  }));
  for (const a of activityRows) {
    termTotals[a.term].totalActivities += 1;
    termTotals[a.term].totalSubmissions += submittedCount(a.id);
  }

  const byTerm = TERMS.map((t) => {
    const possibleSubmissions =
      termTotals[t].totalActivities * enrolledStudents;
    const avgCompletionPct =
      possibleSubmissions > 0
        ? Math.min(
            100,
            Math.round((termTotals[t].totalSubmissions / possibleSubmissions) * 100),
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
  const totalSubmissionsOverall = activityRows.reduce(
    (s, a) => s + submittedCount(a.id),
    0,
  );
  const avgCompletionPctOverall =
    possibleSubmissionsOverall > 0
      ? Math.min(
          100,
          Math.round((totalSubmissionsOverall / possibleSubmissionsOverall) * 100),
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
  const submittedIds = await getSubmittedActivityIds(
    supabase,
    studentId,
    activityRows.map((a) => a.id),
  );

  return buildStudentProgress(classId, studentId, activityRows, submittedIds);
}