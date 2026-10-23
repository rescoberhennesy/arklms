// src/lib/actions/analytics.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { listMyClasses } from '@/lib/actions/classes';
import { getGradebookView } from '@/lib/actions/gradebook';
import type { TeacherClassListItem } from '@/types/class';

// ============================================================================
// SHARED TYPES
// ============================================================================

export type RiskLevel = 'safe' | 'watch' | 'at_risk';
export type Trend = 'improving' | 'stable' | 'declining' | 'insufficient_data';

export interface StudentStats {
  studentId: string;
  fullName: string | null;
  email: string | null;
  assignmentAvgPct: number | null;
  quizAvgPct: number | null;
  /** Official grade from the gradebook (same as the Grades tab) */
  overallAvgPct: number | null;
  submissionRate: number | null;
  dueCount: number;
  missingCount: number;
  trend: Trend;
  trendDelta: number | null;
  risk: RiskLevel;
  riskReasons: string[];
  scores: (number | null)[];
}

export interface ClassTimelinePoint {
  activityId: string;
  title: string;
  kind: 'assignment' | 'quiz';
  date: string;
  classAvgPct: number | null;
  gradedCount: number;
}

export interface ClassStudentStatsResult {
  classId: string;
  className: string;
  studentCount: number;
  stats: StudentStats[];
  classAvgPct: number | null;
  atRiskCount: number;
  watchCount: number;
  timeline: ClassTimelinePoint[];
  passingGrade?: number;
  gradingMethod?: 'raw' | 'deped';
}

// ============================================================================
// HELPERS
// ============================================================================

const TREND_MIN_POINTS = 4;
const TREND_DELTA_THRESHOLD = 5;

function classifyTrend(chronologicalScores: number[]): { trend: Trend; delta: number | null } {
  if (chronologicalScores.length < TREND_MIN_POINTS) return { trend: 'insufficient_data', delta: null };
  const recent = chronologicalScores.slice(-3);
  const earlier = chronologicalScores.slice(0, -3);
  if (earlier.length === 0) return { trend: 'insufficient_data', delta: null };
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const delta = avg(recent) - avg(earlier);
  if (delta >= TREND_DELTA_THRESHOLD) return { trend: 'improving', delta };
  if (delta <= -TREND_DELTA_THRESHOLD) return { trend: 'declining', delta };
  return { trend: 'stable', delta };
}

function classifyRisk(stats: {
  overallAvgPct: number | null;
  submissionRate: number | null;
  trend: Trend;
  passing: number;
}): { risk: RiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  const p = stats.passing;

  const lowScore = stats.overallAvgPct !== null && stats.overallAvgPct < p - 10;
  const lowSubmission = stats.submissionRate !== null && stats.submissionRate < 0.6;
  const declining = stats.trend === 'declining';

  if (lowScore) reasons.push(`grade ${stats.overallAvgPct!.toFixed(1)} (well below passing ${p})`);
  if (lowSubmission) reasons.push(`submission rate ${(stats.submissionRate! * 100).toFixed(0)}% (below 60%)`);
  if (declining) reasons.push('score trend declining');
  if (lowScore || lowSubmission || declining) return { risk: 'at_risk', reasons };

  const nearScore = stats.overallAvgPct !== null && stats.overallAvgPct < p;
  const borderlineSubmission =
    stats.submissionRate !== null && stats.submissionRate >= 0.6 && stats.submissionRate < 0.7;

  if (nearScore) reasons.push(`grade ${stats.overallAvgPct!.toFixed(1)} (just below passing ${p})`);
  if (borderlineSubmission) reasons.push(`submission rate ${(stats.submissionRate! * 100).toFixed(0)}% (borderline)`);
  if (nearScore || borderlineSubmission) return { risk: 'watch', reasons };

  return { risk: 'safe', reasons: [] };
}

// ============================================================================
// PANEL 1 — STUDENT WATCH
// ============================================================================

export async function getClassStudentStats(classId: string): Promise<ClassStudentStatsResult> {
  const supabase = await createClient();

  const { data: klass, error: classErr } = await supabase.from('classes').select('id, name').eq('id', classId).single();
  if (classErr || !klass) throw new Error('Class not found or access denied');

  const { data: enrollments, error: enrollErr } = await supabase
    .from('class_enrollments')
    .select('student_id, profiles!class_enrollments_student_id_fkey(id, full_name, email)')
    .eq('class_id', classId);
  if (enrollErr) throw new Error(`Roster query failed: ${enrollErr.message}`);

  type EnrollmentRow = {
    student_id: string;
    profiles:
      | { id: string; full_name: string | null; email: string | null }
      | { id: string; full_name: string | null; email: string | null }[]
      | null;
  };
  const students = ((enrollments ?? []) as EnrollmentRow[]).map((e) => {
    const p = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles;
    return { studentId: e.student_id, fullName: p?.full_name ?? null, email: p?.email ?? null };
  });

  if (students.length === 0) {
    return {
      classId,
      className: klass.name,
      studentCount: 0,
      stats: [],
      classAvgPct: null,
      atRiskCount: 0,
      watchCount: 0,
      timeline: [],
    };
  }

  const nowIso = new Date().toISOString();
  const { data: activities, error: actErr } = await supabase
    .from('activities')
    .select('id, title, activity_kind, max_points, quiz_total_points, start_at, due_at, published')
    .eq('class_id', classId)
    .eq('published', true)
    .lte('start_at', nowIso)
    .order('start_at', { ascending: true });
  if (actErr) throw new Error(`Activities query failed: ${actErr.message}`);

  type ActRow = {
    id: string;
    title: string;
    activity_kind: 'assignment' | 'quiz';
    max_points: number;
    quiz_total_points: number | null;
    start_at: string;
    due_at: string;
    published: boolean;
  };
  const acts = (activities ?? []) as ActRow[];

  const actMax = new Map<string, number>();
  for (const a of acts) {
    const max =
      a.activity_kind === 'quiz' && a.quiz_total_points && a.quiz_total_points > 0
        ? Number(a.quiz_total_points)
        : Number(a.max_points);
    actMax.set(a.id, max);
  }

  const assignmentIds = acts.filter((a) => a.activity_kind === 'assignment').map((a) => a.id);
  const quizIds = acts.filter((a) => a.activity_kind === 'quiz').map((a) => a.id);

  if (acts.length === 0) {
    return {
      classId,
      className: klass.name,
      studentCount: students.length,
      stats: students.map((s) => ({
        studentId: s.studentId,
        fullName: s.fullName,
        email: s.email,
        assignmentAvgPct: null,
        quizAvgPct: null,
        overallAvgPct: null,
        submissionRate: null,
        dueCount: 0,
        missingCount: 0,
        trend: 'insufficient_data' as const,
        trendDelta: null,
        risk: 'safe' as const,
        riskReasons: [],
        scores: [],
      })),
      classAvgPct: null,
      atRiskCount: 0,
      watchCount: 0,
      timeline: [],
    };
  }

  const studentIds = students.map((s) => s.studentId);

  type SubRow = {
    id: string;
    activity_id: string;
    student_id: string;
    activity_grades: { score: number }[] | { score: number } | null;
  };
  let assignmentSubs: SubRow[] = [];
  if (assignmentIds.length > 0) {
    const { data, error } = await supabase
      .from('activity_submissions')
      .select('id, activity_id, student_id, activity_grades(score)')
      .in('activity_id', assignmentIds)
      .in('student_id', studentIds)
      .eq('is_draft', false);
    if (error) throw new Error(`Assignment submissions query failed: ${error.message}`);
    assignmentSubs = (data ?? []) as SubRow[];
  }

  type QuizRow = {
    activity_id: string;
    student_id: string;
    submitted_at: string | null;
    auto_score: number | null;
    manual_score_override: number | null;
  };
  let quizAttempts: QuizRow[] = [];
  if (quizIds.length > 0) {
    const { data, error } = await supabase
      .from('quiz_attempts')
      .select('activity_id, student_id, submitted_at, auto_score, manual_score_override')
      .in('activity_id', quizIds)
      .in('student_id', studentIds)
      .not('submitted_at', 'is', null);
    if (error) throw new Error(`Quiz attempts query failed: ${error.message}`);
    quizAttempts = (data ?? []) as QuizRow[];
  }

  const assignmentByStudent = new Map<string, Map<string, { submitted: boolean; gradePct: number | null }>>();
  for (const s of students) assignmentByStudent.set(s.studentId, new Map());
  for (const sub of assignmentSubs) {
    const max = actMax.get(sub.activity_id);
    if (!max) continue;
    const grade = Array.isArray(sub.activity_grades) ? sub.activity_grades[0] : sub.activity_grades;
    const pct = grade ? (Number(grade.score) / max) * 100 : null;
    assignmentByStudent.get(sub.student_id)?.set(sub.activity_id, { submitted: true, gradePct: pct });
  }

  const quizByStudent = new Map<string, Map<string, { submitted: boolean; gradePct: number | null }>>();
  for (const s of students) quizByStudent.set(s.studentId, new Map());
  for (const qa of quizAttempts) {
    const max = actMax.get(qa.activity_id);
    if (!max) continue;
    const rawScore =
      qa.manual_score_override !== null && qa.manual_score_override !== undefined
        ? Number(qa.manual_score_override)
        : qa.auto_score !== null && qa.auto_score !== undefined
          ? Number(qa.auto_score)
          : null;
    const pct = rawScore !== null ? (rawScore / max) * 100 : null;
    quizByStudent.get(qa.student_id)?.set(qa.activity_id, { submitted: true, gradePct: pct });
  }

  // Official grades = same numbers as the Grades tab (weights + transmutation)
  const gradebook = await getGradebookView(classId);
  const officialByStudent = new Map(gradebook.students.map((g) => [g.studentId, g.finalPercent]));
  const passing = gradebook.weights?.passingGrade ?? 75;
  const gradingMethod = gradebook.weights?.gradingMethod ?? 'raw';

  const stats: StudentStats[] = students.map((s) => {
    const myAssignments = assignmentByStudent.get(s.studentId)!;
    const myQuizzes = quizByStudent.get(s.studentId)!;

    const aGraded = assignmentIds
      .map((id) => myAssignments.get(id)?.gradePct)
      .filter((v): v is number => v !== null && v !== undefined);
    const assignmentAvgPct = aGraded.length > 0 ? aGraded.reduce((a, b) => a + b, 0) / aGraded.length : null;

    const qGraded = quizIds
      .map((id) => myQuizzes.get(id)?.gradePct)
      .filter((v): v is number => v !== null && v !== undefined);
    const quizAvgPct = qGraded.length > 0 ? qGraded.reduce((a, b) => a + b, 0) / qGraded.length : null;

    const overallAvgPct = officialByStudent.get(s.studentId) ?? null;

    let submitted = 0;
    let missing = 0;
    for (const a of acts) {
      const map = a.activity_kind === 'quiz' ? myQuizzes : myAssignments;
      if (map.get(a.id)?.submitted) submitted++;
      else missing++;
    }
    const submissionRate = acts.length > 0 ? submitted / acts.length : null;

    const trendPoints: number[] = [];
    for (const a of acts) {
      const map = a.activity_kind === 'quiz' ? myQuizzes : myAssignments;
      const rec = map.get(a.id);
      if (rec?.gradePct !== null && rec?.gradePct !== undefined) trendPoints.push(rec.gradePct);
      else if (!rec?.submitted) trendPoints.push(0);
    }

    const scores: (number | null)[] = acts.map((a) => {
      const map = a.activity_kind === 'quiz' ? myQuizzes : myAssignments;
      const rec = map.get(a.id);
      if (rec?.gradePct !== null && rec?.gradePct !== undefined) return rec.gradePct;
      if (!rec?.submitted) return 0;
      return null;
    });

    const { trend, delta: trendDelta } = classifyTrend(trendPoints);
    const { risk, reasons: riskReasons } = classifyRisk({ overallAvgPct, submissionRate, trend, passing });

    return {
      studentId: s.studentId,
      fullName: s.fullName,
      email: s.email,
      assignmentAvgPct,
      quizAvgPct,
      overallAvgPct,
      submissionRate,
      dueCount: acts.length,
      missingCount: missing,
      trend,
      trendDelta,
      risk,
      riskReasons,
      scores,
    };
  });

  const overallScores = stats.map((s) => s.overallAvgPct).filter((v): v is number => v !== null);
  const classAvgPct = overallScores.length > 0 ? overallScores.reduce((a, b) => a + b, 0) / overallScores.length : null;
  const atRiskCount = stats.filter((s) => s.risk === 'at_risk').length;
  const watchCount = stats.filter((s) => s.risk === 'watch').length;

  const timeline: ClassTimelinePoint[] = acts.map((a) => {
    const byStudent = a.activity_kind === 'quiz' ? quizByStudent : assignmentByStudent;
    const vals = students
      .map((s) => byStudent.get(s.studentId)?.get(a.id)?.gradePct)
      .filter((v): v is number => v !== null && v !== undefined);
    return {
      activityId: a.id,
      title: a.title,
      kind: a.activity_kind,
      date: a.due_at ?? a.start_at,
      classAvgPct: vals.length > 0 ? vals.reduce((x, y) => x + y, 0) / vals.length : null,
      gradedCount: vals.length,
    };
  });

  return {
    classId,
    className: klass.name,
    passingGrade: passing,
    gradingMethod,
    studentCount: students.length,
    stats: stats.sort((a, b) => {
      const tier = (r: RiskLevel) => (r === 'at_risk' ? 0 : r === 'watch' ? 1 : 2);
      const t = tier(a.risk) - tier(b.risk);
      if (t !== 0) return t;
      return (a.overallAvgPct ?? 101) - (b.overallAvgPct ?? 101);
    }),
    classAvgPct,
    atRiskCount,
    watchCount,
    timeline,
  };
}

// ============================================================================
// PANEL 2 — ACTIVITY DIAGNOSTICS
// ============================================================================

export interface QuestionDiagnostic {
  questionId: string;
  displayOrder: number;
  kind: string;
  promptPreview: string;
  totalResponses: number;
  correctCount: number;
  correctRate: number;
  isFlagged: boolean;
  correctAnswer: string | null;
  topWrongAnswer: string | null;
  topWrongCount: number;
}

export interface QuizDiagnostics {
  kind: 'quiz';
  activityId: string;
  activityTitle: string;
  maxPoints: number;
  totalAttempts: number;
  meanScorePct: number | null;
  questions: QuestionDiagnostic[];
  scorePcts: number[];
}

export interface AssignmentDiagnostics {
  kind: 'assignment';
  activityId: string;
  activityTitle: string;
  maxPoints: number;
  totalEnrolled: number;
  submissionCount: number;
  gradedCount: number;
  submissionRate: number;
  meanScorePct: number | null;
  passRate: number | null;
  failRate: number | null;
  distribution: { bucket: string; count: number }[];
  scorePcts: number[];
}

export type ActivityDiagnostics = QuizDiagnostics | AssignmentDiagnostics;

export async function getActivityDiagnostics(activityId: string): Promise<ActivityDiagnostics> {
  const supabase = await createClient();

  const { data: act, error: actErr } = await supabase
    .from('activities')
    .select('id, class_id, title, activity_kind, max_points, quiz_total_points')
    .eq('id', activityId)
    .single();
  if (actErr || !act) throw new Error('Activity not found or access denied');

  const effectiveMax =
    act.activity_kind === 'quiz' && act.quiz_total_points && Number(act.quiz_total_points) > 0
      ? Number(act.quiz_total_points)
      : Number(act.max_points);

  if (act.activity_kind === 'quiz') {
    return getQuizDiagnostics(supabase, act.id, act.title, effectiveMax);
  }
  return getAssignmentDiagnostics(supabase, act.id, act.class_id, act.title, effectiveMax);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeCorrect(kind: string, c: any): string | null {
  if (!c) return null;
  if (kind === 'mc_single') return c.options?.[c.correct?.[0]] ?? null;
  if (kind === 'mc_multi') return (c.correct ?? []).map((i: number) => c.options?.[i]).join(', ') || null;
  if (kind === 'true_false') return c.correct ? 'True' : 'False';
  if (kind === 'short_answer') return (c.acceptable ?? []).join(' / ') || null;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeAnswer(kind: string, c: any, a: any): string | null {
  if (!a) return null;
  if (kind === 'mc_single')
    return typeof a.selected === 'number' && a.selected >= 0 ? c?.options?.[a.selected] ?? null : null;
  if (kind === 'mc_multi')
    return Array.isArray(a.selected) && a.selected.length
      ? [...a.selected].sort().map((i: number) => c?.options?.[i]).join(', ')
      : null;
  if (kind === 'true_false') return typeof a.selected === 'boolean' ? (a.selected ? 'True' : 'False') : null;
  if (kind === 'short_answer') return typeof a.text === 'string' && a.text.trim() ? a.text.trim().toLowerCase() : null;
  return null;
}

async function getQuizDiagnostics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  activityId: string,
  activityTitle: string,
  maxPoints: number,
): Promise<QuizDiagnostics> {
  const { data: questions, error: qErr } = await supabase
    .from('quiz_questions')
    .select('id, question_kind, prompt, points, display_order, config')
    .eq('activity_id', activityId)
    .order('display_order', { ascending: true });
  if (qErr) throw new Error(`Quiz questions query failed: ${qErr.message}`);

  type QRow = { id: string; question_kind: string; prompt: string; points: number; display_order: number; config: unknown };
  const qs = (questions ?? []) as QRow[];

  const { data: attempts, error: aErr } = await supabase
    .from('quiz_attempts')
    .select('id, auto_score, manual_score_override, submitted_at')
    .eq('activity_id', activityId)
    .not('submitted_at', 'is', null);
  if (aErr) throw new Error(`Quiz attempts query failed: ${aErr.message}`);

  type AttRow = { id: string; auto_score: number | null; manual_score_override: number | null; submitted_at: string };
  const atts = (attempts ?? []) as AttRow[];
  const attemptIds = atts.map((a) => a.id);

  type RespRow = {
    attempt_id: string;
    question_id: string;
    auto_correct: boolean | null;
    manual_points: number | null;
    answer: unknown;
  };
  let responses: RespRow[] = [];
  if (attemptIds.length > 0) {
    const { data, error } = await supabase
      .from('quiz_responses')
      .select('attempt_id, question_id, auto_correct, manual_points, answer')
      .in('attempt_id', attemptIds);
    if (error) throw new Error(`Quiz responses query failed: ${error.message}`);
    responses = (data ?? []) as RespRow[];
  }

  const FLAG_THRESHOLD = 0.5;
  const MIN_RESPONSES_TO_FLAG = 3;
  const qById = new Map(qs.map((q) => [q.id, q]));

  const byQuestion = new Map<string, { total: number; correct: number; wrong: Map<string, number> }>();
  for (const r of responses) {
    const q = qById.get(r.question_id);
    if (!q) continue;
    const b = byQuestion.get(r.question_id) ?? { total: 0, correct: 0, wrong: new Map<string, number>() };
    if (r.auto_correct !== null) {
      b.total += 1;
      const adjustedFull = r.manual_points !== null && Number(r.manual_points) >= Number(q.points);
      if (r.auto_correct === true || adjustedFull) b.correct += 1;
      else {
        const text = describeAnswer(q.question_kind, q.config, r.answer) ?? '(no answer)';
        b.wrong.set(text, (b.wrong.get(text) ?? 0) + 1);
      }
    }
    byQuestion.set(r.question_id, b);
  }

  const questionDiagnostics: QuestionDiagnostic[] = qs.map((q) => {
    const b = byQuestion.get(q.id) ?? { total: 0, correct: 0, wrong: new Map<string, number>() };
    const rate = b.total > 0 ? b.correct / b.total : 0;
    let topWrongAnswer: string | null = null;
    let topWrongCount = 0;
    for (const [text, n] of b.wrong) {
      if (n > topWrongCount) {
        topWrongAnswer = text;
        topWrongCount = n;
      }
    }
    return {
      questionId: q.id,
      displayOrder: q.display_order,
      kind: q.question_kind,
      promptPreview: q.prompt.length > 140 ? q.prompt.slice(0, 137) + '...' : q.prompt,
      totalResponses: b.total,
      correctCount: b.correct,
      correctRate: rate,
      isFlagged: b.total >= MIN_RESPONSES_TO_FLAG && rate < FLAG_THRESHOLD,
      correctAnswer: describeCorrect(q.question_kind, q.config),
      topWrongAnswer,
      topWrongCount,
    };
  });

  const attemptScorePcts = atts
    .map((a) => {
      const raw =
        a.manual_score_override !== null && a.manual_score_override !== undefined
          ? Number(a.manual_score_override)
          : a.auto_score !== null && a.auto_score !== undefined
            ? Number(a.auto_score)
            : null;
      return raw !== null ? (raw / maxPoints) * 100 : null;
    })
    .filter((v): v is number => v !== null);
  const meanScorePct =
    attemptScorePcts.length > 0 ? attemptScorePcts.reduce((a, b) => a + b, 0) / attemptScorePcts.length : null;

  return {
    kind: 'quiz',
    activityId,
    activityTitle,
    maxPoints,
    totalAttempts: atts.length,
    meanScorePct,
    questions: questionDiagnostics,
    scorePcts: attemptScorePcts,
  };
}

async function getAssignmentDiagnostics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  activityId: string,
  classId: string,
  activityTitle: string,
  maxPoints: number,
): Promise<AssignmentDiagnostics> {
  const { count: enrolledCount, error: rosterErr } = await supabase
    .from('class_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId);
  if (rosterErr) throw new Error(`Roster count failed: ${rosterErr.message}`);
  const totalEnrolled = enrolledCount ?? 0;

  const { data: subs, error: subErr } = await supabase
    .from('activity_submissions')
    .select('id, activity_grades(score)')
    .eq('activity_id', activityId)
    .eq('is_draft', false);
  if (subErr) throw new Error(`Submissions query failed: ${subErr.message}`);

  type SubRow = { id: string; activity_grades: { score: number }[] | { score: number } | null };
  const rows = (subs ?? []) as SubRow[];
  const submissionCount = rows.length;

  const gradedPcts: number[] = [];
  for (const s of rows) {
    const g = Array.isArray(s.activity_grades) ? s.activity_grades[0] : s.activity_grades;
    if (g) gradedPcts.push((Number(g.score) / maxPoints) * 100);
  }
  const gradedCount = gradedPcts.length;

  const meanScorePct = gradedCount > 0 ? gradedPcts.reduce((a, b) => a + b, 0) / gradedCount : null;
  const passRate = gradedCount > 0 ? gradedPcts.filter((p) => p >= 75).length / gradedCount : null;
  const failRate = gradedCount > 0 ? gradedPcts.filter((p) => p < 60).length / gradedCount : null;

  const buckets: Record<string, number> = { '0-59': 0, '60-69': 0, '70-79': 0, '80-89': 0, '90-100': 0 };
  for (const p of gradedPcts) {
    if (p < 60) buckets['0-59']++;
    else if (p < 70) buckets['60-69']++;
    else if (p < 80) buckets['70-79']++;
    else if (p < 90) buckets['80-89']++;
    else buckets['90-100']++;
  }
  const distribution = Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));

  return {
    kind: 'assignment',
    activityId,
    activityTitle,
    maxPoints,
    totalEnrolled,
    submissionCount,
    gradedCount,
    submissionRate: totalEnrolled > 0 ? submissionCount / totalEnrolled : 0,
    meanScorePct,
    passRate,
    failRate,
    distribution,
    scorePcts: gradedPcts,
  };
}

// ============================================================================
// LIST: activities for the diagnostics dropdown
// ============================================================================

export interface AnalyticsActivityOption {
  id: string;
  title: string;
  activityKind: 'assignment' | 'quiz';
  published: boolean;
}

export async function listActivitiesForAnalytics(classId: string): Promise<AnalyticsActivityOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('activities')
    .select('id, title, activity_kind, published, start_at')
    .eq('class_id', classId)
    .eq('published', true)
    .order('start_at', { ascending: false });
  if (error) throw new Error(`Activities list failed: ${error.message}`);
  return (
    (data ?? []) as Array<{ id: string; title: string; activity_kind: 'assignment' | 'quiz'; published: boolean }>
  ).map((a) => ({ id: a.id, title: a.title, activityKind: a.activity_kind, published: a.published }));
}

// ============================================================================
// CROSS-CLASS (teacher Analytics shortcut page)
// ============================================================================

export interface MyClassAnalyticsFilters {
  classId?: string | null;
  section?: string | null;
  track?: string | null;
  gradeLevel?: string | null;
}

export interface ClassHealthCard {
  class: TeacherClassListItem;
  studentCount: number;
  classAvgPct: number | null;
  atRiskCount: number;
  watchCount: number;
  safeCount: number;
  totalMissingSubmissions: number;
  studentsAwaitingGrades: number;
}

export interface AtRiskClassMembership {
  classId: string;
  className: string;
  risk: 'at_risk' | 'watch';
  overallAvgPct: number | null;
  submissionRate: number | null;
  missingCount: number;
  dueCount: number;
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
  riskReasons: string[];
}

export interface AtRiskStudentRow {
  studentId: string;
  fullName: string | null;
  email: string | null;
  atRiskClassCount: number;
  watchClassCount: number;
  memberships: AtRiskClassMembership[];
  worstAvgPct: number | null;
}

export interface AggregatedAnalytics {
  healthCards: ClassHealthCard[];
  atRiskStudents: AtRiskStudentRow[];
}

export async function getMyClassAnalytics(filters?: MyClassAnalyticsFilters): Promise<AggregatedAnalytics> {
  const classesRes = await listMyClasses();
  if (!classesRes.ok) throw new Error(classesRes.error);

  const active = classesRes.data.filter((c) => !c.is_archived);
  const matched = active.filter((c) => {
    if (filters?.classId && c.id !== filters.classId) return false;
    if (filters?.section && c.section !== filters.section) return false;
    if (filters?.track && c.track !== filters.track) return false;
    if (filters?.gradeLevel && c.grade_level !== filters.gradeLevel) return false;
    return true;
  });

  if (matched.length === 0) return { healthCards: [], atRiskStudents: [] };

  const perClassStats = await Promise.all(matched.map((c) => getClassStudentStats(c.id)));

  const healthCards: ClassHealthCard[] = matched.map((c, i) => {
    const stats = perClassStats[i];
    return {
      class: c,
      studentCount: stats.studentCount,
      classAvgPct: stats.classAvgPct,
      atRiskCount: stats.atRiskCount,
      watchCount: stats.watchCount,
      safeCount: Math.max(0, stats.studentCount - stats.atRiskCount - stats.watchCount),
      totalMissingSubmissions: stats.stats.reduce((sum, s) => sum + s.missingCount, 0),
      studentsAwaitingGrades: stats.stats.filter(
        (s) => s.overallAvgPct === null && s.submissionRate !== null && s.submissionRate > 0,
      ).length,
    };
  });

  const byStudent = new Map<string, AtRiskStudentRow>();
  for (let i = 0; i < matched.length; i++) {
    const c = matched[i];
    const stats = perClassStats[i];
    for (const s of stats.stats) {
      if (s.risk !== 'at_risk' && s.risk !== 'watch') continue;
      const membership: AtRiskClassMembership = {
        classId: c.id,
        className: stats.className,
        risk: s.risk,
        overallAvgPct: s.overallAvgPct,
        submissionRate: s.submissionRate,
        missingCount: s.missingCount,
        dueCount: s.dueCount,
        trend: s.trend,
        riskReasons: s.riskReasons,
      };
      const existing = byStudent.get(s.studentId);
      if (existing) {
        existing.memberships.push(membership);
        if (s.risk === 'at_risk') existing.atRiskClassCount += 1;
        else existing.watchClassCount += 1;
        if (s.overallAvgPct !== null && (existing.worstAvgPct === null || s.overallAvgPct < existing.worstAvgPct)) {
          existing.worstAvgPct = s.overallAvgPct;
        }
      } else {
        byStudent.set(s.studentId, {
          studentId: s.studentId,
          fullName: s.fullName,
          email: s.email,
          atRiskClassCount: s.risk === 'at_risk' ? 1 : 0,
          watchClassCount: s.risk === 'watch' ? 1 : 0,
          memberships: [membership],
          worstAvgPct: s.overallAvgPct,
        });
      }
    }
  }

  const atRiskStudents = Array.from(byStudent.values()).sort((a, b) => {
    if (a.atRiskClassCount !== b.atRiskClassCount) return b.atRiskClassCount - a.atRiskClassCount;
    const aTotal = a.atRiskClassCount + a.watchClassCount;
    const bTotal = b.atRiskClassCount + b.watchClassCount;
    if (aTotal !== bTotal) return bTotal - aTotal;
    return (a.worstAvgPct ?? 101) - (b.worstAvgPct ?? 101);
  });

  return { healthCards, atRiskStudents };
}