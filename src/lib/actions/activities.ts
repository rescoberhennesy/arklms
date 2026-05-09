// src/lib/actions/activities.ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ModuleTerm } from '@/lib/types/modules';
import {
  type Activity,
  type ActivitySubmission,
  type ActivityGrade,
  type ActivityWithStudentState,
  type ActivityWithAllSubmissions,
  type SubmissionWithGrade,
  type SubmissionAttachment,
  type SubmissionAttachmentInput,
  type ClassGradeWeights,
  type SubmissionType,
  computeActivityStatus,
} from '@/lib/types/activities';

// --- Internal helpers -----------------------------------------------------

interface ActivityRow {
  id: string;
  class_id: string;
  term: ModuleTerm;
  activity_kind: 'assignment' | 'quiz';
  title: string;
  description: string;
  max_points: string | number;
  start_at: string;
  due_at: string;
  allow_late: boolean;
  allow_resubmission: boolean;
  submission_type: SubmissionType;
  published: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface SubmissionRow {
  id: string;
  activity_id: string;
  student_id: string;
  submitted_at: string;
  text_body: string | null;
  is_late: boolean;
  updated_at: string;
}

interface AttachmentRow {
  id: string;
  submission_id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
}

interface GradeRow {
  id: string;
  submission_id: string;
  score: string | number;
  feedback: string;
  graded_by: string;
  graded_at: string;
  returned_at: string | null;
}

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
}

interface GradeWeightsRow {
  class_id: string;
  prelim_pct: string | number;
  midterm_pct: string | number;
  prefinal_pct: string | number;
  final_pct: string | number;
  created_at: string;
  updated_at: string;
}

function mapActivity(r: ActivityRow): Activity {
  return {
    id: r.id,
    classId: r.class_id,
    term: r.term,
    activityKind: r.activity_kind,
    title: r.title,
    description: r.description,
    maxPoints: Number(r.max_points),
    startAt: r.start_at,
    dueAt: r.due_at,
    allowLate: r.allow_late,
    allowResubmission: r.allow_resubmission,
    submissionType: r.submission_type,
    published: r.published,
    displayOrder: r.display_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapAttachment(r: AttachmentRow): SubmissionAttachment {
  return {
    id: r.id,
    submissionId: r.submission_id,
    filePath: r.file_path,
    fileName: r.file_name,
    fileSize: r.file_size,
    mimeType: r.mime_type,
    uploadedAt: r.uploaded_at,
  };
}

function mapSubmission(
  r: SubmissionRow,
  attachments: SubmissionAttachment[],
): ActivitySubmission {
  return {
    id: r.id,
    activityId: r.activity_id,
    studentId: r.student_id,
    submittedAt: r.submitted_at,
    textBody: r.text_body,
    isLate: r.is_late,
    updatedAt: r.updated_at,
    attachments,
  };
}

function mapGrade(r: GradeRow): ActivityGrade {
  return {
    id: r.id,
    submissionId: r.submission_id,
    score: Number(r.score),
    feedback: r.feedback,
    gradedBy: r.graded_by,
    gradedAt: r.graded_at,
    returnedAt: r.returned_at,
  };
}

function mapGradeWeights(r: GradeWeightsRow): ClassGradeWeights {
  return {
    classId: r.class_id,
    prelimPct: Number(r.prelim_pct),
    midtermPct: Number(r.midterm_pct),
    prefinalPct: Number(r.prefinal_pct),
    finalPct: Number(r.final_pct),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function revalidateClassPaths(classId: string, activityId?: string) {
  revalidatePath(`/teacher/classes/${classId}`);
  revalidatePath(`/student/classes/${classId}`);
  if (activityId) {
    revalidatePath(`/teacher/classes/${classId}/activities/${activityId}`);
    revalidatePath(`/student/classes/${classId}/activities/${activityId}`);
  }
}

async function lookupClassAndActivityForSubmission(
  submissionId: string,
): Promise<{ classId: string; activityId: string } | null> {
  const supabase = await createClient();

  const { data: submission, error: subErr } = await supabase
    .from('activity_submissions')
    .select('activity_id')
    .eq('id', submissionId)
    .maybeSingle();
  if (subErr || !submission) return null;
  const activityId = (submission as { activity_id: string }).activity_id;

  const { data: activity, error: actErr } = await supabase
    .from('activities')
    .select('class_id')
    .eq('id', activityId)
    .maybeSingle();
  if (actErr || !activity) return null;

  return {
    classId: (activity as { class_id: string }).class_id,
    activityId,
  };
}

// --- Reads ----------------------------------------------------------------

export async function listActivitiesForTeacher(
  classId: string,
): Promise<ActivityWithAllSubmissions[]> {
  const supabase = await createClient();

  const { data: activities, error: actErr } = await supabase
    .from('activities')
    .select('*')
    .eq('class_id', classId)
    .order('term', { ascending: true })
    .order('display_order', { ascending: true });
  if (actErr) throw new Error(actErr.message);
  if (!activities) return [];

  const activityIds = (activities as ActivityRow[]).map((a) => a.id);
  if (activityIds.length === 0) {
    return (activities as ActivityRow[]).map((a) => ({
      ...mapActivity(a),
      submissions: [],
    }));
  }

  const { data: submissions, error: subErr } = await supabase
    .from('activity_submissions')
    .select('*')
    .in('activity_id', activityIds);
  if (subErr) throw new Error(subErr.message);

  const submissionRows = (submissions ?? []) as SubmissionRow[];
  const submissionIds = submissionRows.map((s) => s.id);
  const studentIds = Array.from(
    new Set(submissionRows.map((s) => s.student_id)),
  );

  const [attachRes, gradeRes, profileRes] = await Promise.all([
    submissionIds.length
      ? supabase
          .from('submission_attachments')
          .select('*')
          .in('submission_id', submissionIds)
      : Promise.resolve({ data: [], error: null }),
    submissionIds.length
      ? supabase
          .from('activity_grades')
          .select('*')
          .in('submission_id', submissionIds)
      : Promise.resolve({ data: [], error: null }),
    studentIds.length
      ? supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', studentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (attachRes.error) throw new Error(attachRes.error.message);
  if (gradeRes.error) throw new Error(gradeRes.error.message);
  if (profileRes.error) throw new Error(profileRes.error.message);

  const attachmentsBySubmission = new Map<string, SubmissionAttachment[]>();
  for (const a of (attachRes.data ?? []) as AttachmentRow[]) {
    const list = attachmentsBySubmission.get(a.submission_id) ?? [];
    list.push(mapAttachment(a));
    attachmentsBySubmission.set(a.submission_id, list);
  }

  const gradeBySubmission = new Map<string, ActivityGrade>();
  for (const g of (gradeRes.data ?? []) as GradeRow[]) {
    gradeBySubmission.set(g.submission_id, mapGrade(g));
  }

  const profileById = new Map<string, { full_name: string; email: string }>();
  for (const p of (profileRes.data ?? []) as ProfileRow[]) {
    profileById.set(p.id, { full_name: p.full_name, email: p.email });
  }

  const submissionsByActivity = new Map<string, SubmissionWithGrade[]>();
  for (const s of submissionRows) {
    const profile = profileById.get(s.student_id);
    const enriched: SubmissionWithGrade = {
      ...mapSubmission(s, attachmentsBySubmission.get(s.id) ?? []),
      grade: gradeBySubmission.get(s.id) ?? null,
      studentName: profile?.full_name ?? 'Unknown',
      studentEmail: profile?.email ?? '',
    };
    const list = submissionsByActivity.get(s.activity_id) ?? [];
    list.push(enriched);
    submissionsByActivity.set(s.activity_id, list);
  }

  return (activities as ActivityRow[]).map((a) => ({
    ...mapActivity(a),
    submissions: submissionsByActivity.get(a.id) ?? [],
  }));
}

export async function listActivitiesForStudent(
  classId: string,
): Promise<ActivityWithStudentState[]> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  if (!user) throw new Error('Not authenticated');

  const { data: activities, error: actErr } = await supabase
    .from('activities')
    .select('*')
    .eq('class_id', classId)
    .order('term', { ascending: true })
    .order('display_order', { ascending: true });
  if (actErr) throw new Error(actErr.message);
  if (!activities || activities.length === 0) return [];

  const activityRows = activities as ActivityRow[];
  const activityIds = activityRows.map((a) => a.id);

  const { data: submissions, error: subErr } = await supabase
    .from('activity_submissions')
    .select('*')
    .in('activity_id', activityIds)
    .eq('student_id', user.id);
  if (subErr) throw new Error(subErr.message);

  const submissionRows = (submissions ?? []) as SubmissionRow[];
  const submissionIds = submissionRows.map((s) => s.id);

  const [attachRes, gradeRes] = await Promise.all([
    submissionIds.length
      ? supabase
          .from('submission_attachments')
          .select('*')
          .in('submission_id', submissionIds)
      : Promise.resolve({ data: [], error: null }),
    submissionIds.length
      ? supabase
          .from('activity_grades')
          .select('*')
          .in('submission_id', submissionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (attachRes.error) throw new Error(attachRes.error.message);
  if (gradeRes.error) throw new Error(gradeRes.error.message);

  const attachmentsBySubmission = new Map<string, SubmissionAttachment[]>();
  for (const a of (attachRes.data ?? []) as AttachmentRow[]) {
    const list = attachmentsBySubmission.get(a.submission_id) ?? [];
    list.push(mapAttachment(a));
    attachmentsBySubmission.set(a.submission_id, list);
  }

  const gradeBySubmission = new Map<string, ActivityGrade>();
  for (const g of (gradeRes.data ?? []) as GradeRow[]) {
    gradeBySubmission.set(g.submission_id, mapGrade(g));
  }

  const submissionByActivity = new Map<string, ActivitySubmission>();
  for (const s of submissionRows) {
    submissionByActivity.set(
      s.activity_id,
      mapSubmission(s, attachmentsBySubmission.get(s.id) ?? []),
    );
  }

  return activityRows.map((a) => {
    const activity = mapActivity(a);
    const submission = submissionByActivity.get(a.id) ?? null;
    const grade = submission ? gradeBySubmission.get(submission.id) ?? null : null;
    return {
      ...activity,
      submission,
      grade,
      status: computeActivityStatus(activity, submission, grade, 'student'),
    };
  });
}

export async function getActivityForTeacher(
  activityId: string,
): Promise<ActivityWithAllSubmissions> {
  const supabase = await createClient();

  const { data: activity, error: actErr } = await supabase
    .from('activities')
    .select('*')
    .eq('id', activityId)
    .single();
  if (actErr) throw new Error(actErr.message);

  const all = await listActivitiesForTeacher(
    (activity as ActivityRow).class_id,
  );
  const found = all.find((a) => a.id === activityId);
  if (!found) throw new Error('Activity not found after listing');
  return found;
}

export async function getActivityForStudent(
  activityId: string,
): Promise<ActivityWithStudentState> {
  const supabase = await createClient();

  const { data: activity, error: actErr } = await supabase
    .from('activities')
    .select('*')
    .eq('id', activityId)
    .single();
  if (actErr) throw new Error(actErr.message);

  const all = await listActivitiesForStudent(
    (activity as ActivityRow).class_id,
  );
  const found = all.find((a) => a.id === activityId);
  if (!found) throw new Error('Activity not found after listing');
  return found;
}

export async function getSubmissionForTeacher(
  submissionId: string,
): Promise<SubmissionWithGrade> {
  const supabase = await createClient();

  const { data: submission, error: subErr } = await supabase
    .from('activity_submissions')
    .select('*')
    .eq('id', submissionId)
    .single();
  if (subErr) throw new Error(subErr.message);

  const submissionRow = submission as SubmissionRow;

  const [attachRes, gradeRes, profileRes] = await Promise.all([
    supabase
      .from('submission_attachments')
      .select('*')
      .eq('submission_id', submissionId),
    supabase
      .from('activity_grades')
      .select('*')
      .eq('submission_id', submissionId)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', submissionRow.student_id)
      .single(),
  ]);
  if (attachRes.error) throw new Error(attachRes.error.message);
  if (gradeRes.error) throw new Error(gradeRes.error.message);
  if (profileRes.error) throw new Error(profileRes.error.message);

  const attachments = ((attachRes.data ?? []) as AttachmentRow[]).map(
    mapAttachment,
  );
  const profile = profileRes.data as { full_name: string; email: string };

  return {
    ...mapSubmission(submissionRow, attachments),
    grade: gradeRes.data ? mapGrade(gradeRes.data as GradeRow) : null,
    studentName: profile.full_name,
    studentEmail: profile.email,
  };
}

export async function getSignedSubmissionAttachmentUrl(
  attachmentId: string,
): Promise<string> {
  const supabase = await createClient();

  const { data: attachment, error: attErr } = await supabase
    .from('submission_attachments')
    .select('file_path')
    .eq('id', attachmentId)
    .single();
  if (attErr) throw new Error(attErr.message);

  const { data, error } = await supabase.storage
    .from('submission-attachments')
    .createSignedUrl((attachment as { file_path: string }).file_path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// --- Writes (teacher) -----------------------------------------------------

export async function createActivity(input: {
  classId: string;
  term: ModuleTerm;
  title: string;
  description?: string;
  maxPoints: number;
  startAt?: string;
  dueAt: string;
  allowLate?: boolean;
  allowResubmission?: boolean;
  submissionType: SubmissionType;
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

  const { data, error } = await supabase
    .from('activities')
    .insert({
      class_id: input.classId,
      term: input.term,
      title: input.title.trim(),
      description: input.description ?? '',
      max_points: input.maxPoints,
      start_at: input.startAt ?? new Date().toISOString(),
      due_at: input.dueAt,
      allow_late: input.allowLate ?? false,
      allow_resubmission: input.allowResubmission ?? false,
      submission_type: input.submissionType,
      display_order: nextOrder,
      published: false,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  revalidateClassPaths(input.classId);
  return { activityId: (data as { id: string }).id };
}

export async function updateActivity(
  activityId: string,
  patch: {
    title?: string;
    description?: string;
    maxPoints?: number;
    startAt?: string;
    dueAt?: string;
    allowLate?: boolean;
    allowResubmission?: boolean;
    submissionType?: SubmissionType;
  },
): Promise<void> {
  const supabase = await createClient();

  const dbPatch: Record<string, unknown> = {};
  if (patch.title !== undefined) dbPatch.title = patch.title.trim();
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (patch.maxPoints !== undefined) dbPatch.max_points = patch.maxPoints;
  if (patch.startAt !== undefined) dbPatch.start_at = patch.startAt;
  if (patch.dueAt !== undefined) dbPatch.due_at = patch.dueAt;
  if (patch.allowLate !== undefined) dbPatch.allow_late = patch.allowLate;
  if (patch.allowResubmission !== undefined)
    dbPatch.allow_resubmission = patch.allowResubmission;
  if (patch.submissionType !== undefined)
    dbPatch.submission_type = patch.submissionType;

  if (Object.keys(dbPatch).length === 0) return;

  const { data, error } = await supabase
    .from('activities')
    .update(dbPatch)
    .eq('id', activityId)
    .select('class_id')
    .single();
  if (error) throw new Error(error.message);

  revalidateClassPaths((data as { class_id: string }).class_id, activityId);
}

export async function setActivityTerm(
  activityId: string,
  term: ModuleTerm,
): Promise<void> {
  const supabase = await createClient();

  const { data: current, error: curErr } = await supabase
    .from('activities')
    .select('class_id, term')
    .eq('id', activityId)
    .single();
  if (curErr) throw new Error(curErr.message);
  const row = current as { class_id: string; term: ModuleTerm };
  if (row.term === term) return;

  const { data: existing, error: orderErr } = await supabase
    .from('activities')
    .select('display_order')
    .eq('class_id', row.class_id)
    .eq('term', term)
    .order('display_order', { ascending: false })
    .limit(1);
  if (orderErr) throw new Error(orderErr.message);
  const nextOrder =
    existing && existing.length > 0
      ? (existing[0] as { display_order: number }).display_order + 1
      : 0;

  const { error } = await supabase
    .from('activities')
    .update({ term, display_order: nextOrder })
    .eq('id', activityId);
  if (error) throw new Error(error.message);

  revalidateClassPaths(row.class_id, activityId);
}

export async function setActivityPublished(
  activityId: string,
  published: boolean,
): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('activities')
    .update({ published })
    .eq('id', activityId)
    .select('class_id')
    .single();
  if (error) throw new Error(error.message);
  revalidateClassPaths((data as { class_id: string }).class_id, activityId);
}

export async function deleteActivity(activityId: string): Promise<void> {
  const supabase = await createClient();

  const { data: activity, error: actErr } = await supabase
    .from('activities')
    .select('class_id')
    .eq('id', activityId)
    .single();
  if (actErr) throw new Error(actErr.message);

  const { data: submissions } = await supabase
    .from('activity_submissions')
    .select('id')
    .eq('activity_id', activityId);

  if (submissions && submissions.length > 0) {
    const submissionIds = (submissions as Array<{ id: string }>).map(
      (s) => s.id,
    );
    const { data: attachments } = await supabase
      .from('submission_attachments')
      .select('file_path')
      .in('submission_id', submissionIds);

    if (attachments && attachments.length > 0) {
      const paths = (attachments as Array<{ file_path: string }>).map(
        (a) => a.file_path,
      );
      await supabase.storage.from('submission-attachments').remove(paths);
    }
  }

  const { error } = await supabase
    .from('activities')
    .delete()
    .eq('id', activityId);
  if (error) throw new Error(error.message);

  revalidateClassPaths((activity as { class_id: string }).class_id);
}

export async function reorderActivities(
  classId: string,
  term: ModuleTerm,
  activityIds: string[],
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('reorder_activities', {
    p_class_id: classId,
    p_term: term,
    p_activity_ids: activityIds,
  });
  if (error) throw new Error(error.message);
  revalidateClassPaths(classId);
}

export async function gradeSubmission(
  submissionId: string,
  score: number,
  feedback: string,
): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  if (!user) throw new Error('Not authenticated');

  const { data: existing } = await supabase
    .from('activity_grades')
    .select('id')
    .eq('submission_id', submissionId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('activity_grades')
      .update({
        score,
        feedback,
        returned_at: null,
        graded_at: new Date().toISOString(),
      })
      .eq('id', (existing as { id: string }).id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('activity_grades').insert({
      submission_id: submissionId,
      score,
      feedback,
      graded_by: user.id,
    });
    if (error) throw new Error(error.message);
  }

  const ctx = await lookupClassAndActivityForSubmission(submissionId);
  if (ctx) revalidateClassPaths(ctx.classId, ctx.activityId);
}

export async function returnGrade(submissionId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('activity_grades')
    .update({ returned_at: new Date().toISOString() })
    .eq('submission_id', submissionId);
  if (error) throw new Error(error.message);

  const ctx = await lookupClassAndActivityForSubmission(submissionId);
  if (ctx) revalidateClassPaths(ctx.classId, ctx.activityId);
}

export async function returnAllGrades(activityId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('return_all_grades', {
    p_activity_id: activityId,
  });
  if (error) throw new Error(error.message);

  const { data: act } = await supabase
    .from('activities')
    .select('class_id')
    .eq('id', activityId)
    .single();
  if (act) {
    revalidateClassPaths((act as { class_id: string }).class_id, activityId);
  }

  return Number(data) || 0;
}

export async function ungradeSubmission(submissionId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('activity_grades')
    .delete()
    .eq('submission_id', submissionId);
  if (error) throw new Error(error.message);

  const ctx = await lookupClassAndActivityForSubmission(submissionId);
  if (ctx) revalidateClassPaths(ctx.classId, ctx.activityId);
}

// --- Grade weights --------------------------------------------------------

/**
 * Read-only fetch of grade weights for a class.
 * Returns null if no weights row exists (caller falls back to unweighted).
 *
 * Renamed from getOrCreateGradeWeights (Session 9 carry-forward). The
 * previous version auto-inserted a 25/25/25/25 row on first read, which
 * defeated the "absent row = unweighted fallback" design from Session 7.
 * Weighted vs unweighted only behaved identically when per-term cardinality
 * was equal; once it diverged, weighted scores became silently wrong.
 */
export async function getGradeWeights(
  classId: string,
): Promise<ClassGradeWeights | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('class_grade_weights')
    .select('*')
    .eq('class_id', classId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapGradeWeights(data as GradeWeightsRow);
}

/**
 * Insert a new weights row for a class. Used by GradeWeightsModal when
 * the class has no row yet. Validates sum=100 client-side; DB-level CHECK
 * also enforces this.
 *
 * For updating an existing row, call updateGradeWeights instead — it
 * uses upsert so it works for both create and update paths, but keeping
 * the explicit create function makes the modal's intent clearer and
 * surfaces a primary-key violation if the caller's weightsExist flag
 * is wrong.
 */
export async function createGradeWeights(
  classId: string,
  weights: {
    prelimPct: number;
    midtermPct: number;
    prefinalPct: number;
    finalPct: number;
  },
): Promise<ClassGradeWeights> {
  const sum =
    weights.prelimPct +
    weights.midtermPct +
    weights.prefinalPct +
    weights.finalPct;
  if (Math.abs(sum - 100) > 0.01) {
    throw new Error(`Weights must sum to 100. Got ${sum}.`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('class_grade_weights')
    .insert({
      class_id: classId,
      prelim_pct: weights.prelimPct,
      midterm_pct: weights.midtermPct,
      prefinal_pct: weights.prefinalPct,
      final_pct: weights.finalPct,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  revalidateClassPaths(classId);
  return mapGradeWeights(data as GradeWeightsRow);
}

export async function updateGradeWeights(
  classId: string,
  weights: {
    prelimPct: number;
    midtermPct: number;
    prefinalPct: number;
    finalPct: number;
  },
): Promise<void> {
  const sum =
    weights.prelimPct +
    weights.midtermPct +
    weights.prefinalPct +
    weights.finalPct;
  if (Math.abs(sum - 100) > 0.01) {
    throw new Error(`Weights must sum to 100. Got ${sum}.`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('class_grade_weights')
    .upsert(
      {
        class_id: classId,
        prelim_pct: weights.prelimPct,
        midterm_pct: weights.midtermPct,
        prefinal_pct: weights.prefinalPct,
        final_pct: weights.finalPct,
      },
      { onConflict: 'class_id' },
    );
  if (error) throw new Error(error.message);

  revalidateClassPaths(classId);
}

// --- Writes (student) -----------------------------------------------------

export async function submitActivity(
  activityId: string,
  textBody: string,
  attachments: SubmissionAttachmentInput[],
): Promise<{
  submissionId: string;
  isLate: boolean;
  replacedGrade: boolean;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('submit_activity', {
    p_activity_id: activityId,
    p_text_body: textBody,
    p_attachment_paths: attachments.map((a) => a.path),
    p_attachment_names: attachments.map((a) => a.name),
    p_attachment_sizes: attachments.map((a) => a.size),
    p_attachment_mime_types: attachments.map((a) => a.mimeType),
  });
  if (error) throw new Error(error.message);

  const row = (data as Array<{
    submission_id: string;
    is_late: boolean;
    replaced_grade: boolean;
  }>)[0];

  const { data: act } = await supabase
    .from('activities')
    .select('class_id')
    .eq('id', activityId)
    .single();
  if (act) {
    revalidateClassPaths((act as { class_id: string }).class_id, activityId);
  }

  return {
    submissionId: row.submission_id,
    isLate: row.is_late,
    replacedGrade: row.replaced_grade,
  };
}