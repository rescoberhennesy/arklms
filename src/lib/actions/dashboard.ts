'use server';

import { createClient } from '@/lib/supabase/server';
import {
  countMyActivePersonalTasks,
  listMyPersonalTasksInWindow,
} from '@/lib/actions/personalTasks';
import type {
  CalendarActivity,
  CalendarPersonalTask,
  StudentTodoItem,
  TeacherTodoItem,
} from '@/lib/types/dashboard';
import type { ActivityKind } from '@/lib/types/activities';

// --- Row helpers ----------------------------------------------------------

interface ActivityCalRow {
  id: string;
  class_id: string;
  title: string;
  activity_kind: ActivityKind;
  due_at: string;
  published: boolean;
}

interface ClassNameRow {
  id: string;
  name: string;
  color: string;
}

interface SubmissionRow {
  id: string;
  activity_id: string;
  student_id: string;
  submitted_at: string;
}

async function getUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

// ==========================================================================
// CALENDAR — STUDENT (activities only — existing callers)
// ==========================================================================

export async function getStudentCalendarActivities(
  monthStart: string,
  monthEnd: string,
): Promise<CalendarActivity[]> {
  const supabase = await createClient();

  const { data: actRows, error: aErr } = await supabase
    .from('activities')
    .select('id, class_id, title, activity_kind, due_at, published')
    .gte('due_at', monthStart)
    .lt('due_at', monthEnd)
    .order('due_at', { ascending: true });
  if (aErr) throw new Error(aErr.message);

  const activities = (actRows ?? []) as ActivityCalRow[];
  if (activities.length === 0) return [];

  return await attachClassMeta(activities);
}

// ==========================================================================
// CALENDAR — TEACHER (activities only — existing callers)
// ==========================================================================

export async function getTeacherCalendarActivities(
  monthStart: string,
  monthEnd: string,
): Promise<CalendarActivity[]> {
  const supabase = await createClient();

  const { data: actRows, error: aErr } = await supabase
    .from('activities')
    .select('id, class_id, title, activity_kind, due_at, published')
    .gte('due_at', monthStart)
    .lt('due_at', monthEnd)
    .order('due_at', { ascending: true });
  if (aErr) throw new Error(aErr.message);

  const activities = (actRows ?? []) as ActivityCalRow[];
  if (activities.length === 0) return [];

  return await attachClassMeta(activities);
}

// ==========================================================================
// CALENDAR — COMBINED (activities + personal tasks)
// ==========================================================================

// Combined shape returned by the new fetchers. Calendar widgets render
// activity dots in class color and task dots in neutral slate.
export interface CalendarFetchResult {
  activities: CalendarActivity[];
  personalTasks: CalendarPersonalTask[];
}

export async function getStudentCalendarItems(
  monthStart: string,
  monthEnd: string,
): Promise<CalendarFetchResult> {
  const [activities, personalTasks] = await Promise.all([
    getStudentCalendarActivities(monthStart, monthEnd),
    listMyPersonalTasksInWindow(monthStart, monthEnd),
  ]);
  return { activities, personalTasks };
}

export async function getTeacherCalendarItems(
  monthStart: string,
  monthEnd: string,
): Promise<CalendarFetchResult> {
  const [activities, personalTasks] = await Promise.all([
    getTeacherCalendarActivities(monthStart, monthEnd),
    listMyPersonalTasksInWindow(monthStart, monthEnd),
  ]);
  return { activities, personalTasks };
}

async function attachClassMeta(
  activities: ActivityCalRow[],
): Promise<CalendarActivity[]> {
  const supabase = await createClient();
  const classIds = Array.from(new Set(activities.map((a) => a.class_id)));

  const { data: classRows, error: cErr } = await supabase
    .from('classes')
    .select('id, name, color')
    .in('id', classIds);
  if (cErr) throw new Error(cErr.message);

  const classById = new Map<string, ClassNameRow>();
  for (const c of (classRows ?? []) as ClassNameRow[]) {
    classById.set(c.id, c);
  }

  return activities.map((a) => {
    const cls = classById.get(a.class_id);
    return {
      activityId: a.id,
      classId: a.class_id,
      className: cls?.name ?? 'Unknown class',
      classColor: cls?.color ?? '#dc2626',
      title: a.title,
      activityKind: a.activity_kind,
      dueAt: a.due_at,
      published: a.published,
    };
  });
}

// ==========================================================================
// TO-DO — STUDENT
// ==========================================================================

export async function getStudentTodoItems(
  limit: number = 10,
): Promise<StudentTodoItem[]> {
  const supabase = await createClient();
  const userId = await getUserId();

  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60_000);

  const { data: actRows, error: aErr } = await supabase
    .from('activities')
    .select('id, class_id, title, activity_kind, due_at, allow_late, published, start_at')
    .lt('due_at', horizon.toISOString())
    .eq('published', true)
    .lte('start_at', now.toISOString())
    .order('due_at', { ascending: true });
  if (aErr) throw new Error(aErr.message);

  type Row = {
    id: string;
    class_id: string;
    title: string;
    activity_kind: ActivityKind;
    due_at: string;
    allow_late: boolean;
    published: boolean;
    start_at: string;
  };
  const activities = (actRows ?? []) as Row[];
  if (activities.length === 0) return [];

  const activityIds = activities.map((a) => a.id);

  const { data: subRows, error: sErr } = await supabase
    .from('activity_submissions')
    .select('activity_id')
    .eq('student_id', userId)
    .in('activity_id', activityIds);
  if (sErr) throw new Error(sErr.message);
  const submittedActivityIds = new Set(
    (subRows ?? []).map((r) => (r as { activity_id: string }).activity_id),
  );

  const quizActivityIds = activities
    .filter((a) => a.activity_kind === 'quiz')
    .map((a) => a.id);
  type QuizAttemptLite = {
    activity_id: string;
    submitted_at: string | null;
  };
  let attemptByActivity = new Map<string, QuizAttemptLite>();
  if (quizActivityIds.length > 0) {
    const { data: attRows, error: qErr } = await supabase
      .from('quiz_attempts')
      .select('activity_id, submitted_at')
      .eq('student_id', userId)
      .in('activity_id', quizActivityIds);
    if (qErr) throw new Error(qErr.message);
    for (const r of (attRows ?? []) as QuizAttemptLite[]) {
      attemptByActivity.set(r.activity_id, r);
    }
  }

  const classIds = Array.from(new Set(activities.map((a) => a.class_id)));
  const { data: classRows, error: cErr } = await supabase
    .from('classes')
    .select('id, name')
    .in('id', classIds);
  if (cErr) throw new Error(cErr.message);
  const classNameById = new Map<string, string>();
  for (const c of (classRows ?? []) as Array<{ id: string; name: string }>) {
    classNameById.set(c.id, c.name);
  }

  const items: StudentTodoItem[] = [];
  for (const a of activities) {
    if (a.activity_kind === 'assignment') {
      if (submittedActivityIds.has(a.id)) continue;
      const isOverdue = new Date(a.due_at).getTime() < now.getTime();
      items.push({
        activityId: a.id,
        classId: a.class_id,
        className: classNameById.get(a.class_id) ?? 'Unknown class',
        title: a.title,
        activityKind: 'assignment',
        dueAt: a.due_at,
        isOverdue,
        quizState: null,
        lateAllowed: a.allow_late && isOverdue,
      });
    } else {
      const att = attemptByActivity.get(a.id);
      if (att && att.submitted_at) continue;
      const isOverdue = new Date(a.due_at).getTime() < now.getTime();
      items.push({
        activityId: a.id,
        classId: a.class_id,
        className: classNameById.get(a.class_id) ?? 'Unknown class',
        title: a.title,
        activityKind: 'quiz',
        dueAt: a.due_at,
        isOverdue,
        quizState: att ? 'in_progress' : 'not_started',
        lateAllowed: a.allow_late && isOverdue,
      });
    }
  }

  items.sort((x, y) => {
    if (x.isOverdue && !y.isOverdue) return -1;
    if (!x.isOverdue && y.isOverdue) return 1;
    return new Date(x.dueAt).getTime() - new Date(y.dueAt).getTime();
  });

  return items.slice(0, limit);
}

// ==========================================================================
// TO-DO — TEACHER
// ==========================================================================

export async function getTeacherTodoItems(
  limit: number = 15,
): Promise<TeacherTodoItem[]> {
  const supabase = await createClient();

  const items: TeacherTodoItem[] = [];

  const fetchCap = Math.max(limit * 4, 40);

  const { data: subRows, error: sErr } = await supabase
    .from('activity_submissions')
    .select('id, activity_id, student_id, submitted_at')
    .order('submitted_at', { ascending: false })
    .limit(fetchCap);
  if (sErr) throw new Error(sErr.message);
  const submissions = (subRows ?? []) as SubmissionRow[];

  if (submissions.length > 0) {
    const subActIds = Array.from(new Set(submissions.map((s) => s.activity_id)));
    const subIds = submissions.map((s) => s.id);

    const { data: actRows, error: aErr } = await supabase
      .from('activities')
      .select('id, class_id, title, activity_kind')
      .in('id', subActIds);
    if (aErr) throw new Error(aErr.message);
    type ActMeta = {
      id: string;
      class_id: string;
      title: string;
      activity_kind: ActivityKind;
    };
    const actById = new Map<string, ActMeta>();
    for (const a of (actRows ?? []) as ActMeta[]) actById.set(a.id, a);

    const { data: gradeRows, error: gErr } = await supabase
      .from('activity_grades')
      .select('submission_id, returned_at')
      .in('submission_id', subIds);
    if (gErr) throw new Error(gErr.message);
    type GradeMeta = { submission_id: string; returned_at: string | null };
    const gradeBySubmission = new Map<string, GradeMeta>();
    for (const g of (gradeRows ?? []) as GradeMeta[]) {
      gradeBySubmission.set(g.submission_id, g);
    }

    const studentIds = Array.from(new Set(submissions.map((s) => s.student_id)));
    const { data: profileRows, error: pErr } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', studentIds);
    if (pErr) throw new Error(pErr.message);
    type ProfileMeta = {
      id: string;
      full_name: string | null;
      email: string | null;
    };
    const profileById = new Map<string, ProfileMeta>();
    for (const p of (profileRows ?? []) as ProfileMeta[]) {
      profileById.set(p.id, p);
    }

    const classIds = Array.from(
      new Set(Array.from(actById.values()).map((a) => a.class_id)),
    );
    const { data: classRows, error: cErr } = await supabase
      .from('classes')
      .select('id, name')
      .in('id', classIds);
    if (cErr) throw new Error(cErr.message);
    const classNameById = new Map<string, string>();
    for (const c of (classRows ?? []) as Array<{ id: string; name: string }>) {
      classNameById.set(c.id, c.name);
    }

    for (const s of submissions) {
      const act = actById.get(s.activity_id);
      if (!act) continue;
      if (act.activity_kind !== 'assignment') continue;

      const grade = gradeBySubmission.get(s.id) ?? null;
      if (grade && grade.returned_at) continue;
      const isDraftGrade = grade !== null && grade.returned_at === null;

      const profile = profileById.get(s.student_id);
      items.push({
        kind: 'submission_ungraded',
        activityId: act.id,
        classId: act.class_id,
        className: classNameById.get(act.class_id) ?? 'Unknown class',
        activityTitle: act.title,
        submissionId: s.id,
        attemptId: null,
        studentName: profile?.full_name ?? null,
        studentEmail: profile?.email ?? null,
        sortKey: s.submitted_at,
        isDraftGrade,
      });
    }
  }

  const { data: attRows, error: qErr } = await supabase
    .from('quiz_attempts')
    .select('id, activity_id, student_id, submitted_at')
    .not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: false })
    .limit(fetchCap);
  if (qErr) throw new Error(qErr.message);
  type AttemptLite = {
    id: string;
    activity_id: string;
    student_id: string;
    submitted_at: string;
  };
  const attempts = (attRows ?? []) as AttemptLite[];

  if (attempts.length > 0) {
    const attemptIds = attempts.map((a) => a.id);
    const attActIds = Array.from(new Set(attempts.map((a) => a.activity_id)));

    const { data: mQuestionRows, error: mqErr } = await supabase
      .from('quiz_questions')
      .select('id')
      .in('activity_id', attActIds)
      .in('question_kind', ['essay', 'short_answer']);
    if (mqErr) throw new Error(mqErr.message);
    const manualQuestionIds = new Set(
      (mQuestionRows ?? []).map((r) => (r as { id: string }).id),
    );

    const pendingAttemptIds = new Set<string>();
    if (manualQuestionIds.size > 0) {
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
        pendingAttemptIds.add(r.attempt_id);
      }
    }

    if (pendingAttemptIds.size > 0) {
      const { data: actRows, error: aErr } = await supabase
        .from('activities')
        .select('id, class_id, title')
        .in('id', attActIds);
      if (aErr) throw new Error(aErr.message);
      type ActLite = { id: string; class_id: string; title: string };
      const actById = new Map<string, ActLite>();
      for (const a of (actRows ?? []) as ActLite[]) actById.set(a.id, a);

      const studentIds = Array.from(new Set(attempts.map((a) => a.student_id)));
      const { data: profileRows, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', studentIds);
      if (pErr) throw new Error(pErr.message);
      const profileById = new Map <
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

      const classIds = Array.from(
        new Set(Array.from(actById.values()).map((a) => a.class_id)),
      );
      const { data: classRows, error: cErr } = await supabase
        .from('classes')
        .select('id, name')
        .in('id', classIds);
      if (cErr) throw new Error(cErr.message);
      const classNameById = new Map<string, string>();
      for (const c of (classRows ?? []) as Array<{ id: string; name: string }>) {
        classNameById.set(c.id, c.name);
      }

      for (const att of attempts) {
        if (!pendingAttemptIds.has(att.id)) continue;
        const act = actById.get(att.activity_id);
        if (!act) continue;
        const profile = profileById.get(att.student_id);
        items.push({
          kind: 'quiz_manual_pending',
          activityId: act.id,
          classId: act.class_id,
          className: classNameById.get(act.class_id) ?? 'Unknown class',
          activityTitle: act.title,
          submissionId: null,
          attemptId: att.id,
          studentName: profile?.full_name ?? null,
          studentEmail: profile?.email ?? null,
          sortKey: att.submitted_at,
          isDraftGrade: false,
        });
      }
    }
  }

  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60_000);

  const { data: deadlineRows, error: dErr } = await supabase
    .from('activities')
    .select('id, class_id, title, due_at')
    .eq('published', true)
    .gte('due_at', now.toISOString())
    .lt('due_at', horizon.toISOString())
    .order('due_at', { ascending: true })
    .limit(fetchCap);
  if (dErr) throw new Error(dErr.message);
  type DeadlineRow = {
    id: string;
    class_id: string;
    title: string;
    due_at: string;
  };
  const deadlines = (deadlineRows ?? []) as DeadlineRow[];

  if (deadlines.length > 0) {
    const classIds = Array.from(new Set(deadlines.map((d) => d.class_id)));
    const { data: classRows, error: cErr } = await supabase
      .from('classes')
      .select('id, name')
      .in('id', classIds);
    if (cErr) throw new Error(cErr.message);
    const classNameById = new Map<string, string>();
    for (const c of (classRows ?? []) as Array<{ id: string; name: string }>) {
      classNameById.set(c.id, c.name);
    }

    for (const d of deadlines) {
      items.push({
        kind: 'class_deadline',
        activityId: d.id,
        classId: d.class_id,
        className: classNameById.get(d.class_id) ?? 'Unknown class',
        activityTitle: d.title,
        submissionId: null,
        attemptId: null,
        studentName: null,
        studentEmail: null,
        sortKey: d.due_at,
        isDraftGrade: false,
      });
    }
  }

  const KIND_ORDER: Record<TeacherTodoItem['kind'], number> = {
    submission_ungraded: 0,
    quiz_manual_pending: 1,
    class_deadline: 2,
  };

  items.sort((x, y) => {
    const kindCmp = KIND_ORDER[x.kind] - KIND_ORDER[y.kind];
    if (kindCmp !== 0) return kindCmp;
    if (x.kind === 'class_deadline') {
      return new Date(x.sortKey).getTime() - new Date(y.sortKey).getTime();
    }
    return new Date(y.sortKey).getTime() - new Date(x.sortKey).getTime();
  });

  return items.slice(0, limit);
}

// ==========================================================================
// STAT-CARD COUNTS
// ==========================================================================

export interface TeacherStatCounts {
  totalClasses: number;
  deadlines: number;
  pendingTasks: number;
}

export interface StudentStatCounts {
  enrolledClasses: number;
  deadlines: number;
  pendingTasks: number;
}

async function countDeadlinesNext7Days(): Promise<number> {
  const supabase = await createClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60_000);

  const { count, error } = await supabase
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('published', true)
    .gte('due_at', now.toISOString())
    .lt('due_at', horizon.toISOString());

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getTeacherStatCounts(): Promise<TeacherStatCounts> {
  const supabase = await createClient();
  const userId = await getUserId();

  const { count: classCount, error: cErr } = await supabase
    .from('classes')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', userId)
    .eq('is_archived', false);
  if (cErr) throw new Error(cErr.message);

  const [todoItems, personalCount, deadlines] = await Promise.all([
    getTeacherTodoItems(),
    countMyActivePersonalTasks(),
    countDeadlinesNext7Days(),
  ]);

  return {
    totalClasses: classCount ?? 0,
    deadlines,
    pendingTasks: todoItems.length + personalCount,
  };
}

export async function getStudentStatCounts(): Promise<StudentStatCounts> {
  const supabase = await createClient();
  const userId = await getUserId();

  const { data: enrollRows, error: eErr } = await supabase
    .from('class_enrollments')
    .select('class_id, classes:class_id ( is_archived )')
    .eq('student_id', userId);
  if (eErr) throw new Error(eErr.message);

  const enrolled = (enrollRows ?? []).filter((r: any) => {
    const cls = r.classes;
    return cls && !cls.is_archived;
  }).length;

  const [todoItems, personalCount, deadlines] = await Promise.all([
    getStudentTodoItems(),
    countMyActivePersonalTasks(),
    countDeadlinesNext7Days(),
  ]);

  return {
    enrolledClasses: enrolled,
    deadlines,
    pendingTasks: todoItems.length + personalCount,
  };
}