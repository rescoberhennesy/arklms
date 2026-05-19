// src/lib/actions/analytics.ts
'use server';

import { createClient } from '@/lib/supabase/server';

import { listMyClasses } from '@/lib/actions/classes';
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
  // Averages computed only over GRADED activities of each kind (0-100 scale)
  assignmentAvgPct: number | null;   // null = no graded assignments
  quizAvgPct: number | null;          // null = no graded quizzes
  overallAvgPct: number | null;       // null = no graded work at all
  // Submission rate: counted over due activities only (graded + submitted-ungraded + missing)
  submissionRate: number | null;      // 0-1, null = no due activities
  dueCount: number;                   // total due activities (denominator)
  missingCount: number;
  // Trend: last 3 vs earlier average pct, using graded + missing (0% for missing)
  trend: Trend;
  trendDelta: number | null;          // recentAvg - earlierAvg in pct points, null if insufficient
  // Computed risk
  risk: RiskLevel;
  riskReasons: string[];              // human-readable, fed to Gemini
}

export interface ClassStudentStatsResult {
  classId: string;
  className: string;
  studentCount: number;
  stats: StudentStats[];
  // Class-level rollups for the AI prompt context
  classAvgPct: number | null;
  atRiskCount: number;
  watchCount: number;
}

// ============================================================================
// HELPERS (pure functions, no I/O)
// ============================================================================

const TREND_MIN_POINTS = 4;          // need at least 4 graded+missing to compute trend
const TREND_DELTA_THRESHOLD = 5;     // pct points

function classifyTrend(
  chronologicalScores: number[],
): { trend: Trend; delta: number | null } {
  if (chronologicalScores.length < TREND_MIN_POINTS) {
    return { trend: 'insufficient_data', delta: null };
  }
  const recent = chronologicalScores.slice(-3);
  const earlier = chronologicalScores.slice(0, -3);
  if (earlier.length === 0) {
    return { trend: 'insufficient_data', delta: null };
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const recentAvg = avg(recent);
  const earlierAvg = avg(earlier);
  const delta = recentAvg - earlierAvg;
  if (delta >= TREND_DELTA_THRESHOLD) return { trend: 'improving', delta };
  if (delta <= -TREND_DELTA_THRESHOLD) return { trend: 'declining', delta };
  return { trend: 'stable', delta };
}

function classifyRisk(stats: {
  overallAvgPct: number | null;
  submissionRate: number | null;
  trend: Trend;
}): { risk: RiskLevel; reasons: string[] } {
  const reasons: string[] = [];

  const lowScore =
    stats.overallAvgPct !== null && stats.overallAvgPct < 70;
  const lowSubmission =
    stats.submissionRate !== null && stats.submissionRate < 0.6;
  const declining = stats.trend === 'declining';

  if (lowScore) {
    reasons.push(
      `average score ${stats.overallAvgPct!.toFixed(1)}% (below 70%)`,
    );
  }
  if (lowSubmission) {
    reasons.push(
      `submission rate ${(stats.submissionRate! * 100).toFixed(0)}% (below 60%)`,
    );
  }
  if (declining) {
    reasons.push('score trend declining');
  }

  if (lowScore || lowSubmission || declining) {
    return { risk: 'at_risk', reasons };
  }

  // Watch: borderline (70-75% score OR 60-70% submission)
  const borderlineScore =
    stats.overallAvgPct !== null &&
    stats.overallAvgPct >= 70 &&
    stats.overallAvgPct < 75;
  const borderlineSubmission =
    stats.submissionRate !== null &&
    stats.submissionRate >= 0.6 &&
    stats.submissionRate < 0.7;

  if (borderlineScore) {
    reasons.push(
      `average score ${stats.overallAvgPct!.toFixed(1)}% (borderline)`,
    );
  }
  if (borderlineSubmission) {
    reasons.push(
      `submission rate ${(stats.submissionRate! * 100).toFixed(0)}% (borderline)`,
    );
  }

  if (borderlineScore || borderlineSubmission) {
    return { risk: 'watch', reasons };
  }

  return { risk: 'safe', reasons: [] };
}

// ============================================================================
// MAIN: PANEL 1 — STUDENT WATCH
// ============================================================================

export async function getClassStudentStats(
  classId: string,
): Promise<ClassStudentStatsResult> {
  const supabase = await createClient();

  // 0. Class + auth gate (RLS already restricts to teacher of class)
  const { data: klass, error: classErr } = await supabase
    .from('classes')
    .select('id, name')
    .eq('id', classId)
    .single();
  if (classErr || !klass) {
    throw new Error('Class not found or access denied');
  }

  // 1. Roster
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
    return {
      studentId: e.student_id,
      fullName: p?.full_name ?? null,
      email: p?.email ?? null,
    };
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
    };
  }

  // 2. Activities in class — only PUBLISHED + DUE (start_at <= now)
  const nowIso = new Date().toISOString();
  const { data: activities, error: actErr } = await supabase
    .from('activities')
    .select('id, activity_kind, max_points, quiz_total_points, start_at, due_at, published')
    .eq('class_id', classId)
    .eq('published', true)
    .lte('start_at', nowIso)
    .order('start_at', { ascending: true });
  if (actErr) throw new Error(`Activities query failed: ${actErr.message}`);

  type ActRow = {
    id: string;
    activity_kind: 'assignment' | 'quiz';
    max_points: number;
    quiz_total_points: number | null;
    start_at: string;
    due_at: string;
    published: boolean;
  };
  const acts = (activities ?? []) as ActRow[];

  // Effective max points: quizzes use quiz_total_points when present, else max_points
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
    // No due activities yet — everyone is "safe" by default with no data
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
      })),
      classAvgPct: null,
      atRiskCount: 0,
      watchCount: 0,
    };
  }

  // 3. Assignment scores: activity_submissions joined to activity_grades
  //    Only count grades that exist (graded). We separately check submissions for the rate.
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
      .in('student_id', studentIds);
    if (error) throw new Error(`Assignment submissions query failed: ${error.message}`);
    assignmentSubs = (data ?? []) as SubRow[];
  }

  // 4. Quiz attempts (only those actually submitted)
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

  // 5. Per-student aggregation
  // Build lookups
  const assignmentByStudent = new Map<string, Map<string, { submitted: boolean; gradePct: number | null }>>();
  for (const s of students) assignmentByStudent.set(s.studentId, new Map());
  for (const sub of assignmentSubs) {
    const max = actMax.get(sub.activity_id);
    if (!max) continue;
    const grade = Array.isArray(sub.activity_grades)
      ? sub.activity_grades[0]
      : sub.activity_grades;
    const pct = grade ? (Number(grade.score) / max) * 100 : null;
    assignmentByStudent
      .get(sub.student_id)
      ?.set(sub.activity_id, { submitted: true, gradePct: pct });
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
    quizByStudent
      .get(qa.student_id)
      ?.set(qa.activity_id, { submitted: true, gradePct: pct });
  }

  // 6. Compute stats per student
  const stats: StudentStats[] = students.map((s) => {
    const myAssignments = assignmentByStudent.get(s.studentId)!;
    const myQuizzes = quizByStudent.get(s.studentId)!;

    // Assignment avg (graded only)
    const aGraded = assignmentIds
      .map((id) => myAssignments.get(id)?.gradePct)
      .filter((v): v is number => v !== null && v !== undefined);
    const assignmentAvgPct =
      aGraded.length > 0 ? aGraded.reduce((a, b) => a + b, 0) / aGraded.length : null;

    // Quiz avg (graded only)
    const qGraded = quizIds
      .map((id) => myQuizzes.get(id)?.gradePct)
      .filter((v): v is number => v !== null && v !== undefined);
    const quizAvgPct =
      qGraded.length > 0 ? qGraded.reduce((a, b) => a + b, 0) / qGraded.length : null;

    // Overall avg = mean of all graded pct (both kinds combined, equal weight per activity)
    const allGraded = [...aGraded, ...qGraded];
    const overallAvgPct =
      allGraded.length > 0
        ? allGraded.reduce((a, b) => a + b, 0) / allGraded.length
        : null;

    // Submission rate: over all due activities, how many did they engage with (submitted, graded, OR submitted-ungraded)
    let submitted = 0;
    let missing = 0;
    for (const a of acts) {
      const map = a.activity_kind === 'quiz' ? myQuizzes : myAssignments;
      if (map.get(a.id)?.submitted) submitted++;
      else missing++;
    }
    const submissionRate = acts.length > 0 ? submitted / acts.length : null;

    // Trend: graded + missing (missing = 0%), chronological by start_at
    const trendPoints: number[] = [];
    for (const a of acts) {
      const map = a.activity_kind === 'quiz' ? myQuizzes : myAssignments;
      const rec = map.get(a.id);
      if (rec?.gradePct !== null && rec?.gradePct !== undefined) {
        trendPoints.push(rec.gradePct);
      } else if (!rec?.submitted) {
        // missing -> 0%
        trendPoints.push(0);
      }
      // else: submitted but not yet graded -> skip from trend
    }
    const { trend, delta: trendDelta } = classifyTrend(trendPoints);

    const { risk, reasons: riskReasons } = classifyRisk({
      overallAvgPct,
      submissionRate,
      trend,
    });

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
    };
  });

  // 7. Rollups
  const overallScores = stats
    .map((s) => s.overallAvgPct)
    .filter((v): v is number => v !== null);
  const classAvgPct =
    overallScores.length > 0
      ? overallScores.reduce((a, b) => a + b, 0) / overallScores.length
      : null;
  const atRiskCount = stats.filter((s) => s.risk === 'at_risk').length;
  const watchCount = stats.filter((s) => s.risk === 'watch').length;

  return {
    classId,
    className: klass.name,
    studentCount: students.length,
    stats: stats.sort((a, b) => {
      // Sort: at_risk first, then watch, then safe; within each tier, lowest score first
      const tier = (r: RiskLevel) => (r === 'at_risk' ? 0 : r === 'watch' ? 1 : 2);
      const t = tier(a.risk) - tier(b.risk);
      if (t !== 0) return t;
      return (a.overallAvgPct ?? 101) - (b.overallAvgPct ?? 101);
    }),
    classAvgPct,
    atRiskCount,
    watchCount,
  };
}

// ============================================================================
// MAIN: PANEL 2 — ACTIVITY DIAGNOSTICS
// ============================================================================

export interface QuestionDiagnostic {
  questionId: string;
  displayOrder: number;
  kind: string;
  promptPreview: string;          // truncated prompt
  totalResponses: number;
  correctCount: number;
  correctRate: number;             // 0-1
  isFlagged: boolean;              // correctRate < 0.5 AND totalResponses >= 3
}

export interface QuizDiagnostics {
  kind: 'quiz';
  activityId: string;
  activityTitle: string;
  maxPoints: number;
  totalAttempts: number;           // submitted attempts
  meanScorePct: number | null;
  questions: QuestionDiagnostic[];
}

export interface AssignmentDiagnostics {
  kind: 'assignment';
  activityId: string;
  activityTitle: string;
  maxPoints: number;
  totalEnrolled: number;
  submissionCount: number;
  gradedCount: number;
  submissionRate: number;          // submissionCount / totalEnrolled
  // Score stats (graded only, 0-100 pct)
  meanScorePct: number | null;
  passRate: number | null;         // graded with pct >= 70
  failRate: number | null;         // graded with pct < 60
  distribution: { bucket: string; count: number }[];  // 0-59, 60-69, 70-79, 80-89, 90-100
}

export type ActivityDiagnostics = QuizDiagnostics | AssignmentDiagnostics;

export async function getActivityDiagnostics(
  activityId: string,
): Promise<ActivityDiagnostics> {
  const supabase = await createClient();

  // 1. Activity (RLS restricts to teacher of class)
  const { data: act, error: actErr } = await supabase
    .from('activities')
    .select('id, class_id, title, activity_kind, max_points, quiz_total_points')
    .eq('id', activityId)
    .single();
  if (actErr || !act) {
    throw new Error('Activity not found or access denied');
  }

  const effectiveMax =
    act.activity_kind === 'quiz' &&
    act.quiz_total_points &&
    Number(act.quiz_total_points) > 0
      ? Number(act.quiz_total_points)
      : Number(act.max_points);

  if (act.activity_kind === 'quiz') {
    return getQuizDiagnostics(supabase, act.id, act.title, effectiveMax);
  }
  return getAssignmentDiagnostics(
    supabase,
    act.id,
    act.class_id,
    act.title,
    effectiveMax,
  );
}

async function getQuizDiagnostics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  activityId: string,
  activityTitle: string,
  maxPoints: number,
): Promise<QuizDiagnostics> {
  // Questions
  const { data: questions, error: qErr } = await supabase
    .from('quiz_questions')
    .select('id, question_kind, prompt, points, display_order')
    .eq('activity_id', activityId)
    .order('display_order', { ascending: true });
  if (qErr) throw new Error(`Quiz questions query failed: ${qErr.message}`);

  type QRow = {
    id: string;
    question_kind: string;
    prompt: string;
    points: number;
    display_order: number;
  };
  const qs = (questions ?? []) as QRow[];

  // Submitted attempts for this quiz
  const { data: attempts, error: aErr } = await supabase
    .from('quiz_attempts')
    .select('id, auto_score, manual_score_override, submitted_at')
    .eq('activity_id', activityId)
    .not('submitted_at', 'is', null);
  if (aErr) throw new Error(`Quiz attempts query failed: ${aErr.message}`);

  type AttRow = {
    id: string;
    auto_score: number | null;
    manual_score_override: number | null;
    submitted_at: string;
  };
  const atts = (attempts ?? []) as AttRow[];
  const attemptIds = atts.map((a) => a.id);

  // Responses for those attempts
  type RespRow = {
    attempt_id: string;
    question_id: string;
    auto_correct: boolean | null;
  };
  let responses: RespRow[] = [];
  if (attemptIds.length > 0) {
    const { data, error } = await supabase
      .from('quiz_responses')
      .select('attempt_id, question_id, auto_correct')
      .in('attempt_id', attemptIds);
    if (error) throw new Error(`Quiz responses query failed: ${error.message}`);
    responses = (data ?? []) as RespRow[];
  }

  // Per-question correct rate
  const FLAG_THRESHOLD = 0.5;
  const MIN_RESPONSES_TO_FLAG = 3;

  const byQuestion = new Map<string, { total: number; correct: number }>();
  for (const r of responses) {
    const bucket = byQuestion.get(r.question_id) ?? { total: 0, correct: 0 };
    // Only count responses where auto_correct is non-null (objective questions
    // OR essay/short-answer questions that have been manually graded into a boolean).
    if (r.auto_correct !== null) {
      bucket.total += 1;
      if (r.auto_correct === true) bucket.correct += 1;
    }
    byQuestion.set(r.question_id, bucket);
  }

  const questionDiagnostics: QuestionDiagnostic[] = qs.map((q) => {
    const b = byQuestion.get(q.id) ?? { total: 0, correct: 0 };
    const rate = b.total > 0 ? b.correct / b.total : 0;
    return {
      questionId: q.id,
      displayOrder: q.display_order,
      kind: q.question_kind,
      promptPreview: q.prompt.length > 140 ? q.prompt.slice(0, 137) + '...' : q.prompt,
      totalResponses: b.total,
      correctCount: b.correct,
      correctRate: rate,
      isFlagged: b.total >= MIN_RESPONSES_TO_FLAG && rate < FLAG_THRESHOLD,
    };
  });

  // Mean total score pct
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
    attemptScorePcts.length > 0
      ? attemptScorePcts.reduce((a, b) => a + b, 0) / attemptScorePcts.length
      : null;

  return {
    kind: 'quiz',
    activityId,
    activityTitle,
    maxPoints,
    totalAttempts: atts.length,
    meanScorePct,
    questions: questionDiagnostics,
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
  // Roster size
  const { count: enrolledCount, error: rosterErr } = await supabase
    .from('class_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId);
  if (rosterErr) throw new Error(`Roster count failed: ${rosterErr.message}`);
  const totalEnrolled = enrolledCount ?? 0;

  // Submissions + grades
  const { data: subs, error: subErr } = await supabase
    .from('activity_submissions')
    .select('id, activity_grades(score)')
    .eq('activity_id', activityId);
  if (subErr) throw new Error(`Submissions query failed: ${subErr.message}`);

  type SubRow = {
    id: string;
    activity_grades: { score: number }[] | { score: number } | null;
  };
  const rows = (subs ?? []) as SubRow[];
  const submissionCount = rows.length;

  const gradedPcts: number[] = [];
  for (const s of rows) {
    const g = Array.isArray(s.activity_grades) ? s.activity_grades[0] : s.activity_grades;
    if (g) {
      gradedPcts.push((Number(g.score) / maxPoints) * 100);
    }
  }
  const gradedCount = gradedPcts.length;

  const meanScorePct =
    gradedCount > 0 ? gradedPcts.reduce((a, b) => a + b, 0) / gradedCount : null;
  const passRate =
    gradedCount > 0
      ? gradedPcts.filter((p) => p >= 70).length / gradedCount
      : null;
  const failRate =
    gradedCount > 0
      ? gradedPcts.filter((p) => p < 60).length / gradedCount
      : null;

  // Distribution buckets
  const buckets: Record<string, number> = {
    '0-59': 0,
    '60-69': 0,
    '70-79': 0,
    '80-89': 0,
    '90-100': 0,
  };
  for (const p of gradedPcts) {
    if (p < 60) buckets['0-59']++;
    else if (p < 70) buckets['60-69']++;
    else if (p < 80) buckets['70-79']++;
    else if (p < 90) buckets['80-89']++;
    else buckets['90-100']++;
  }
  const distribution = Object.entries(buckets).map(([bucket, count]) => ({
    bucket,
    count,
  }));

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

export async function listActivitiesForAnalytics(
  classId: string,
): Promise<AnalyticsActivityOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('activities')
    .select('id, title, activity_kind, published, start_at')
    .eq('class_id', classId)
    .eq('published', true)
    .order('start_at', { ascending: false });
  if (error) throw new Error(`Activities list failed: ${error.message}`);
  return ((data ?? []) as Array<{
    id: string;
    title: string;
    activity_kind: 'assignment' | 'quiz';
    published: boolean;
  }>).map((a) => ({
    id: a.id,
    title: a.title,
    activityKind: a.activity_kind,
    published: a.published,
  }));
}

/**
 * Same filter shape as the other three shortcut pages.
 */
export interface MyClassAnalyticsFilters {
  classId?: string | null;
  section?: string | null;
  track?: string | null;
  gradeLevel?: string | null;
}

/**
 * Per-class health summary for the top cards grid. Derived entirely from
 * what getClassStudentStats already returns plus a quick scan of activities
 * for ungraded/missing counts.
 */
export interface ClassHealthCard {
  class: TeacherClassListItem;
  studentCount: number;
  classAvgPct: number | null;
  atRiskCount: number;
  watchCount: number;
  safeCount: number;
  totalMissingSubmissions: number; // sum of missingCount across all students
  /**
   * Students with at least one ungraded submission across the class's
   * activities. We don't have a direct "is anything ungraded" count in
   * StudentStats, so we derive it from missingCount being lower than
   * dueCount × students — but that gets messy. Simpler: we re-compute
   * here from the same stats. See implementation below.
   *
   * Actually, since StudentStats doesn't expose ungraded-vs-graded
   * counts directly, we surface the next-best signal: students whose
   * overallAvgPct is null but who have submitted work (i.e. submissions
   * exist but no grades yet → submissionRate > 0 but overallAvgPct null).
   * This is "needs grading attention" at the class level.
   */
  studentsAwaitingGrades: number;
}

/**
 * A single class-membership for an at-risk student in the cross-class
 * roll-up. One student can have many of these (one per class they're
 * at-risk in).
 */
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

/**
 * One row in the cross-class at-risk students table. Grouped by student,
 * so a student in three at-risk classes appears once with three memberships.
 */
export interface AtRiskStudentRow {
  studentId: string;
  fullName: string | null;
  email: string | null;
  /** How many of the teacher's filtered classes this student is at-risk in. */
  atRiskClassCount: number;
  /** How many they're in 'watch' status. */
  watchClassCount: number;
  /** All the classes the student is flagged in (at_risk + watch combined). */
  memberships: AtRiskClassMembership[];
  /**
   * Worst overall avg pct across all their flagged classes — used for the
   * default sort (lowest avg first). null if every flagged class has null.
   */
  worstAvgPct: number | null;
}

export interface AggregatedAnalytics {
  healthCards: ClassHealthCard[];
  atRiskStudents: AtRiskStudentRow[];
}

/**
 * For the signed-in teacher: load every active class they own that matches
 * the supplied filters, compute per-class health summaries AND a
 * cross-class at-risk students roll-up.
 *
 * Why this shape: getClassStudentStats is heavy (it computes risk levels,
 * trends, and submission rates for every student in a class). We run it
 * per matched class via Promise.all and reuse the same per-class results
 * for BOTH the health cards and the at-risk roll-up — one fan-out, two
 * outputs. The roll-up is where the unique cross-class value lives:
 * counting risk classifications across classes is the only aggregation
 * that's defensible given the "grades aren't comparable across subjects"
 * rule we've been enforcing on the other pages.
 */
export async function getMyClassAnalytics(
  filters?: MyClassAnalyticsFilters,
): Promise<AggregatedAnalytics> {
  const classesRes = await listMyClasses();
  if (!classesRes.ok) throw new Error(classesRes.error);

  const active = classesRes.data.filter((c) => !c.is_archived);

  const matched = active.filter((c) => {
    if (filters?.classId && c.id !== filters.classId) return false;
    if (filters?.section && c.section !== filters.section) return false;
    if (filters?.track && c.track !== filters.track) return false;
    if (filters?.gradeLevel && c.grade_level !== filters.gradeLevel) {
      return false;
    }
    return true;
  });

  if (matched.length === 0) {
    return { healthCards: [], atRiskStudents: [] };
  }

  // Single fan-out: per-class student stats. Used for both outputs below.
  const perClassStats = await Promise.all(
    matched.map((c) => getClassStudentStats(c.id)),
  );

  // ---- Build health cards ----
  const healthCards: ClassHealthCard[] = matched.map((c, i) => {
    const stats = perClassStats[i];
    const safeCount =
      stats.studentCount - stats.atRiskCount - stats.watchCount;
    const totalMissingSubmissions = stats.stats.reduce(
      (sum, s) => sum + s.missingCount,
      0,
    );
    // Students who have submitted at least one thing but have no graded
    // work yet (submissionRate > 0 implies they engaged; overallAvgPct
    // null means nothing has been graded). Best proxy we have for
    // "teacher has grading to do" at the class level without doing a
    // second pass on activities.
    const studentsAwaitingGrades = stats.stats.filter(
      (s) =>
        s.overallAvgPct === null &&
        s.submissionRate !== null &&
        s.submissionRate > 0,
    ).length;

    return {
      class: c,
      studentCount: stats.studentCount,
      classAvgPct: stats.classAvgPct,
      atRiskCount: stats.atRiskCount,
      watchCount: stats.watchCount,
      safeCount: Math.max(0, safeCount),
      totalMissingSubmissions,
      studentsAwaitingGrades,
    };
  });

  // ---- Build cross-class at-risk students roll-up ----
  // Walk every flagged student in every class and group by studentId.
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
        if (
          s.overallAvgPct !== null &&
          (existing.worstAvgPct === null || s.overallAvgPct < existing.worstAvgPct)
        ) {
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
    // Sort priority:
    //  1. More at_risk classes first (a 3-class at-risk student outranks a 1-class one)
    //  2. Then more total flagged classes
    //  3. Then lowest worstAvgPct first
    if (a.atRiskClassCount !== b.atRiskClassCount) {
      return b.atRiskClassCount - a.atRiskClassCount;
    }
    const aTotal = a.atRiskClassCount + a.watchClassCount;
    const bTotal = b.atRiskClassCount + b.watchClassCount;
    if (aTotal !== bTotal) return bTotal - aTotal;
    const aAvg = a.worstAvgPct ?? 101;
    const bAvg = b.worstAvgPct ?? 101;
    return aAvg - bAvg;
  });

  return { healthCards, atRiskStudents };
}