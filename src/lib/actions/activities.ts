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
import { notifyActivityPublished } from '@/lib/actions/notifications';
import { notifyGradeReleased } from '@/lib/actions/notifications';
import { notifyGradesReleasedBulk } from '@/lib/actions/notifications';
import { notifySubmissionCreated } from '@/lib/actions/notifications';

// --- Internal helpers -----------------------------------------------------

interface ActivityRow {
  id: string;
  class_id: string;
  term: ModuleTerm;
  activity_kind: 'assignment' | 'quiz';
  title: string;
  instructions: string;
  prompt: string;
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
    instructions: r.instructions,
    prompt: r.prompt,
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
  instructions?: string;
  prompt?: string;
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
      instructions: input.instructions ?? '',
      prompt: input.prompt ?? '',
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
    instructions?: string;
    prompt?: string;
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
  if (patch.instructions !== undefined) dbPatch.instructions = patch.instructions;
  if (patch.prompt !== undefined) dbPatch.prompt = patch.prompt;
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
    .select('class_id, title, activity_kind')
    .single();
  if (error) throw new Error(error.message);
  const row = data as { class_id: string; title: string; activity_kind: 'assignment' | 'quiz' };
  revalidateClassPaths(row.class_id, activityId);

  if (published) {
    try {
      const { data: classRow } = await supabase
        .from('classes')
        .select('name')
        .eq('id', row.class_id)
        .maybeSingle();
      const className = (classRow as { name: string } | null)?.name ?? 'your class';
      await notifyActivityPublished({
        activityId,
        classId: row.class_id,
        className,
        activityTitle: row.title,
        activityKind: row.activity_kind,
      });
    } catch (e) {
      console.error('[activities] publish notify error:', e);
    }
  }
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

  // Also clean up activity attachments (teacher-uploaded reference files).
  const { data: activityAttachments } = await supabase
    .from('activity_attachments')
    .select('file_path')
    .eq('activity_id', activityId);
  if (activityAttachments && activityAttachments.length > 0) {
    const paths = (activityAttachments as Array<{ file_path: string }>).map(
      (a) => a.file_path,
    );
    await supabase.storage.from('activity-attachments').remove(paths);
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

  try {
    const { data: subRow } = await supabase
      .from('activity_submissions')
      .select('student_id, activity:activity_id(id, title, class_id, class:class_id(name))')
      .eq('id', submissionId)
      .maybeSingle();
    const row = subRow as unknown as {
      student_id: string;
      activity: { id: string; title: string; class_id: string; class: { name: string } | null } | null;
    } | null;
    if (row && row.activity) {
      await notifyGradeReleased({
        submissionId,
        activityId: row.activity.id,
        activityTitle: row.activity.title,
        classId: row.activity.class_id,
        className: row.activity.class?.name ?? 'your class',
        studentId: row.student_id,
      });
    }
  } catch (e) {
    console.error('[activities] returnGrade notify error:', e);
  }
}

export async function returnAllGrades(activityId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('return_all_grades', {
    p_activity_id: activityId,
  });
  if (error) throw new Error(error.message);

  const { data: act } = await supabase
    .from('activities')
    .select('class_id, title, class:class_id(name)')
    .eq('id', activityId)
    .single();
  if (act) {
    const row = act as unknown as { class_id: string; title: string; class: { name: string } | null };
    revalidateClassPaths(row.class_id, activityId);

    try {
      await notifyGradesReleasedBulk({
        activityId,
        activityTitle: row.title,
        classId: row.class_id,
        className: row.class?.name ?? 'your class',
      });
    } catch (e) {
      console.error('[activities] returnAllGrades notify error:', e);
    }
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
    .select('class_id, title, class:class_id(name, teacher_id)')
    .eq('id', activityId)
    .single();
  if (act) {
    const actRow = act as unknown as {
      class_id: string;
      title: string;
      class: { name: string; teacher_id: string } | null;
    };
    revalidateClassPaths(actRow.class_id, activityId);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && actRow.class) {
        const { data: studentRow } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', user.id)
          .maybeSingle();
        const student = studentRow as { full_name: string | null; email: string } | null;
        const studentName = student?.full_name?.trim() || student?.email || 'A student';
        await notifySubmissionCreated({
          submissionId: row.submission_id,
          activityId,
          activityTitle: actRow.title,
          classId: actRow.class_id,
          className: actRow.class.name,
          teacherId: actRow.class.teacher_id,
          studentName,
        });
      }
    } catch (e) {
      console.error('[activities] submit notify error:', e);
    }
  }

  return {
    submissionId: row.submission_id,
    isLate: row.is_late,
    replacedGrade: row.replaced_grade,
  };
}

// ==========================================================================
// Activity attachments (teacher-uploaded reference files for assignments)
// ==========================================================================

interface ActivityAttachmentRow {
  id: string;
  activity_id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  uploaded_at: string;
}

function mapActivityAttachment(r: ActivityAttachmentRow) {
  return {
    id: r.id,
    activityId: r.activity_id,
    filePath: r.file_path,
    fileName: r.file_name,
    fileSize: r.file_size,
    mimeType: r.mime_type,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
  };
}

export async function listActivityAttachments(
  activityId: string,
): Promise<import('@/lib/types/activities').ActivityAttachment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('activity_attachments')
    .select('*')
    .eq('activity_id', activityId)
    .order('uploaded_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapActivityAttachment(r as ActivityAttachmentRow));
}

export async function createActivityAttachment(input: {
  activityId: string;
  attachment: import('@/lib/types/activities').ActivityAttachmentInput;
}): Promise<{ attachmentId: string }> {
  const supabase = await createClient();

 const { data: actData, error: actErr } = await supabase
    .from('activities')
    .select('class_id')
    .eq('id', input.activityId)
    .single();
  if (actErr) throw new Error(actErr.message);
  const act = actData as { class_id: string };

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('activity_attachments')
    .insert({
      activity_id: input.activityId,
      file_path: input.attachment.path,
      file_name: input.attachment.name,
      file_size: input.attachment.size,
      mime_type: input.attachment.mimeType,
      uploaded_by: user.id,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  revalidatePath(`/teacher/classes/${act.class_id}`);
  revalidatePath(`/teacher/classes/${act.class_id}/activities/${input.activityId}`);
  revalidatePath(`/student/classes/${act.class_id}/activities/${input.activityId}`);

  return { attachmentId: (data as { id: string }).id };
}

export async function deleteActivityAttachment(
  attachmentId: string,
): Promise<void> {
  const supabase = await createClient();

  const { data: existing, error: getErr } = await supabase
    .from('activity_attachments')
    .select('activity_id, file_path, activities!inner(class_id)')
    .eq('id', attachmentId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const row = existing as unknown as {
    activity_id: string;
    file_path: string;
    activities: { class_id: string };
  };

  const { error: storageErr } = await supabase.storage
    .from('activity-attachments')
    .remove([row.file_path]);
  if (storageErr) throw new Error(`Failed to delete file: ${storageErr.message}`);

  const { error: dbErr } = await supabase
    .from('activity_attachments')
    .delete()
    .eq('id', attachmentId);
  if (dbErr) throw new Error(dbErr.message);

  revalidatePath(`/teacher/classes/${row.activities.class_id}`);
  revalidatePath(
    `/teacher/classes/${row.activities.class_id}/activities/${row.activity_id}`,
  );
  revalidatePath(
    `/student/classes/${row.activities.class_id}/activities/${row.activity_id}`,
  );
}

export async function getSignedActivityAttachmentUrl(
  filePath: string,
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from('activity-attachments')
    .createSignedUrl(filePath, 60 * 60); // 1-hour signed URL
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ==========================================================================
// Activity duplication (Session 14)
// ==========================================================================
//
// Three actions:
//   - listTeacherClassesForCopy: classes the current user teaches; used to
//     populate the cross-class picker.
//   - listClassActivitiesForCopy: lightweight activity list for a given
//     class id, used inside the picker once the user chooses a source class.
//   - duplicateActivity: actually performs the copy.
//
// duplicateActivity copies the activity row (with title-suffix on same-class
// copy), all quiz settings/questions, and all activity_attachments
// (deep-copying storage objects via the Supabase Storage copy() API).
// Submissions/attempts/grades are NEVER copied.
//
// Atomicity model: insert activity -> insert quiz questions if any -> copy
// storage objects + insert attachment rows. If a storage copy fails partway
// through, delete the new activity (cascades to questions/attachments)
// AND remove any storage objects already copied. Returns the new activity
// id on success.

export interface TeacherClassForCopy {
  classId: string;
  name: string;
  section: string | null;
}

export async function listTeacherClassesForCopy(): Promise<
  TeacherClassForCopy[]
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  if (!user) throw new Error('Not authenticated');

  // RLS on classes already filters to the teacher's classes for teacher
  // role. We further narrow by teacher_id in case the SELECT policy is
  // broader than we expect.
  const { data, error } = await supabase
    .from('classes')
    .select('id, name, section')
    .eq('teacher_id', user.id)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);

  type Row = { id: string; name: string; section: string | null };
  return ((data ?? []) as Row[]).map((r) => ({
    classId: r.id,
    name: r.name,
    section: r.section,
  }));
}

export interface ClassActivityForCopy {
  activityId: string;
  title: string;
  activityKind: 'assignment' | 'quiz';
  term: ModuleTerm;
}

export async function listClassActivitiesForCopy(
  classId: string,
): Promise<ClassActivityForCopy[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('activities')
    .select('id, title, activity_kind, term, display_order')
    .eq('class_id', classId)
    .order('term', { ascending: true })
    .order('display_order', { ascending: true });
  if (error) throw new Error(error.message);

  type Row = {
    id: string;
    title: string;
    activity_kind: 'assignment' | 'quiz';
    term: ModuleTerm;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    activityId: r.id,
    title: r.title,
    activityKind: r.activity_kind,
    term: r.term,
  }));
}

export interface DuplicateActivityInput {
  sourceActivityId: string;
  targetClassId: string;
  targetTerm: ModuleTerm;
}

export async function duplicateActivity(
  input: DuplicateActivityInput,
): Promise<{ activityId: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  if (!user) throw new Error('Not authenticated');

  // Fetch source activity (all the quiz/config columns too).
  const { data: srcData, error: srcErr } = await supabase
    .from('activities')
    .select(
      'id, class_id, term, activity_kind, title, instructions, prompt, max_points, allow_late, allow_resubmission, submission_type, time_limit_minutes, shuffle_questions, auto_release_grade, show_correct_answers, quiz_total_points',
    )
    .eq('id', input.sourceActivityId)
    .single();
  if (srcErr) throw new Error(`Failed to load source activity: ${srcErr.message}`);
  const src = srcData as {
    id: string;
    class_id: string;
    term: ModuleTerm;
    activity_kind: 'assignment' | 'quiz';
    title: string;
    instructions: string;
    prompt: string;
    max_points: string | number;
    allow_late: boolean;
    allow_resubmission: boolean;
    submission_type: SubmissionType;
    time_limit_minutes: number | null;
    shuffle_questions: boolean;
    auto_release_grade: boolean;
    show_correct_answers: boolean;
    quiz_total_points: string | number | null;
  };

  const sameClass = src.class_id === input.targetClassId;
  const newTitle = sameClass ? `${src.title} (copy)` : src.title;

  // Compute next display_order in the target term.
  const { data: orderRows, error: orderErr } = await supabase
    .from('activities')
    .select('display_order')
    .eq('class_id', input.targetClassId)
    .eq('term', input.targetTerm)
    .order('display_order', { ascending: false })
    .limit(1);
  if (orderErr) throw new Error(orderErr.message);
  const nextOrder =
    orderRows && orderRows.length > 0
      ? (orderRows[0] as { display_order: number }).display_order + 1
      : 0;

  // Default dates: starts now, due 7 days from now. Teacher edits after.
  const now = new Date();
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 7);

  const insertPayload: Record<string, unknown> = {
    class_id: input.targetClassId,
    term: input.targetTerm,
    activity_kind: src.activity_kind,
    title: newTitle,
    instructions: src.instructions,
    prompt: src.prompt,
    max_points: Number(src.max_points),
    start_at: now.toISOString(),
    due_at: dueDate.toISOString(),
    allow_late: src.allow_late,
    allow_resubmission: src.allow_resubmission,
    submission_type: src.submission_type,
    display_order: nextOrder,
    published: false, // ALWAYS start as draft
    time_limit_minutes: src.time_limit_minutes,
    shuffle_questions: src.shuffle_questions,
    auto_release_grade: src.auto_release_grade,
    show_correct_answers: src.show_correct_answers,
    quiz_total_points:
      src.quiz_total_points === null ? null : Number(src.quiz_total_points),
  };

  const { data: newActData, error: insErr } = await supabase
    .from('activities')
    .insert(insertPayload)
    .select('id')
    .single();
  if (insErr) throw new Error(`Failed to create duplicate: ${insErr.message}`);
  const newActivityId = (newActData as { id: string }).id;

  // Storage paths we've copied (for rollback if a later step fails).
  const copiedStoragePaths: string[] = [];

  try {
    // 1) Copy quiz questions (if any).
    if (src.activity_kind === 'quiz') {
      const { data: srcQuestions, error: qErr } = await supabase
        .from('quiz_questions')
        .select(
          'question_kind, prompt, points, display_order, shuffle_options, config',
        )
        .eq('activity_id', src.id)
        .order('display_order', { ascending: true });
      if (qErr) throw new Error(`Failed to load source questions: ${qErr.message}`);

      const qRows = (srcQuestions ?? []) as Array<{
        question_kind: string;
        prompt: string;
        points: string | number;
        display_order: number;
        shuffle_options: boolean;
        config: unknown;
      }>;

      if (qRows.length > 0) {
        const newQuestions = qRows.map((q) => ({
          activity_id: newActivityId,
          question_kind: q.question_kind,
          prompt: q.prompt,
          points: Number(q.points),
          display_order: q.display_order,
          shuffle_options: q.shuffle_options,
          config: q.config,
        }));
        const { error: qInsErr } = await supabase
          .from('quiz_questions')
          .insert(newQuestions);
        if (qInsErr)
          throw new Error(`Failed to copy questions: ${qInsErr.message}`);
      }
    }

    // 2) Copy attachments (storage objects + DB rows).
    const { data: srcAttachments, error: attErr } = await supabase
      .from('activity_attachments')
      .select('file_path, file_name, file_size, mime_type')
      .eq('activity_id', src.id);
    if (attErr) throw new Error(`Failed to load source attachments: ${attErr.message}`);

    const attRows = (srcAttachments ?? []) as Array<{
      file_path: string;
      file_name: string;
      file_size: number;
      mime_type: string;
    }>;

    for (const att of attRows) {
      // Generate a path mirroring the existing convention:
      //   <class_id>/<new_uuid>/<timestamp>-<filename>
      // Use crypto.randomUUID for the segment; Date.now() for the timestamp;
      // file_name carries the original filename.
      const newUuid = crypto.randomUUID();
      const ts = Date.now();
      const safeName = att.file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const destPath = `${input.targetClassId}/${newUuid}/${ts}-${safeName}`;

      // Server-side copy via Supabase Storage. This is the cheap path —
      // no download-reupload round trip.
      const { error: copyErr } = await supabase.storage
        .from('activity-attachments')
        .copy(att.file_path, destPath);
      if (copyErr) {
        throw new Error(`Failed to copy file "${att.file_name}": ${copyErr.message}`);
      }
      copiedStoragePaths.push(destPath);

      const { error: attInsErr } = await supabase
        .from('activity_attachments')
        .insert({
          activity_id: newActivityId,
          file_path: destPath,
          file_name: att.file_name,
          file_size: att.file_size,
          mime_type: att.mime_type,
          uploaded_by: user.id,
        });
      if (attInsErr) {
        // The storage object now exists but no DB row. Treat as the same
        // failure mode — rollback will catch the path we already pushed.
        throw new Error(
          `Failed to insert attachment row for "${att.file_name}": ${attInsErr.message}`,
        );
      }
    }
  } catch (err) {
    // Rollback: best-effort cleanup. Errors here are logged, not thrown,
    // because the caller already has a real error to surface.
    try {
      if (copiedStoragePaths.length > 0) {
        await supabase.storage
          .from('activity-attachments')
          .remove(copiedStoragePaths);
      }
    } catch (cleanupErr) {
      console.error(
        '[activities] duplicate rollback storage cleanup error:',
        cleanupErr,
      );
    }
    try {
      // Cascade deletes quiz_questions and activity_attachments rows.
      await supabase.from('activities').delete().eq('id', newActivityId);
    } catch (cleanupErr) {
      console.error(
        '[activities] duplicate rollback activity delete error:',
        cleanupErr,
      );
    }
    throw err;
  }

  revalidateClassPaths(input.targetClassId);
  return { activityId: newActivityId };
}
