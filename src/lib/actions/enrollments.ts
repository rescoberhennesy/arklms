// src/lib/actions/enrollments.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type {
  PendingJoinRequest,
  StudentClassListItem,
} from '@/types/class';

async function requireAuthUserId() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect('/');
  return { supabase, userId: user.id };
}

// --------------------------------------------------------------------------
// STUDENT — join flow
// --------------------------------------------------------------------------

export type JoinByCodeResult =
  | { kind: 'pending'; class_id: string; message: string }
  | { kind: 'already_enrolled'; class_id: string }
  | { kind: 'request_pending'; class_id: string };

export async function requestJoinClassByCode(code: string): Promise<JoinByCodeResult> {
  const { supabase } = await requireAuthUserId();

  const trimmed = code.trim();
  if (!trimmed) throw new Error('Please enter an invite code');

  const { data, error } = await supabase.rpc('request_join_class_by_code', {
    p_code: trimmed,
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Unknown error joining class');

  const classId = row.class_id as string;
  const message = (row.message as string) ?? '';

  revalidatePath('/student/classes');
  revalidatePath('/student/dashboard');

  if (message === 'already enrolled') {
    return { kind: 'already_enrolled', class_id: classId };
  }
  if (message === 'request already pending') {
    return { kind: 'request_pending', class_id: classId };
  }
  return { kind: 'pending', class_id: classId, message };
}

export async function listMyEnrolledClasses(): Promise<StudentClassListItem[]> {
  const { supabase, userId } = await requireAuthUserId();

  const { data, error } = await supabase
    .from('class_enrollments')
    .select(
      `
        enrolled_at,
        classes:class_id (
          id, name, section, semester, color, cover_photo_url, is_archived,
          teacher:teacher_id ( full_name )
        )
      `,
    )
    .eq('student_id', userId)
    .order('enrolled_at', { ascending: false });

  if (error) throw new Error(`Failed to list enrolled classes: ${error.message}`);

  return (data ?? [])
    .map((row: any) => {
      const c = row.classes;
      if (!c || c.is_archived) return null;
      return {
        id: c.id,
        name: c.name,
        section: c.section,
        semester: c.semester,
        color: c.color,
        cover_photo_url: c.cover_photo_url,
        teacher_name: c.teacher?.full_name ?? null,
        enrolled_at: row.enrolled_at,
      } as StudentClassListItem;
    })
    .filter((x): x is StudentClassListItem => x !== null);
}

export async function listMyPendingRequests(): Promise<
  Array<{ id: string; class_id: string; class_name: string; requested_at: string }>
> {
  const { supabase, userId } = await requireAuthUserId();
  const { data, error } = await supabase
    .from('class_join_requests')
    .select(`id, class_id, requested_at, classes:class_id ( name )`)
    .eq('student_id', userId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false });

  if (error) throw new Error(`Failed to list pending requests: ${error.message}`);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    class_id: row.class_id,
    class_name: row.classes?.name ?? '(unknown class)',
    requested_at: row.requested_at,
  }));
}

export async function cancelMyJoinRequest(requestId: string): Promise<void> {
  const { supabase } = await requireAuthUserId();
  const { error } = await supabase
    .from('class_join_requests')
    .delete()
    .eq('id', requestId)
    .eq('status', 'pending');
  if (error) throw new Error(`Failed to cancel request: ${error.message}`);
  revalidatePath('/student/classes');
  revalidatePath('/student/dashboard');
}

// --------------------------------------------------------------------------
// TEACHER — approvals & roster
// --------------------------------------------------------------------------

export async function listPendingJoinRequests(
  classId: string,
): Promise<PendingJoinRequest[]> {
  const { supabase } = await requireAuthUserId();

  const { data, error } = await supabase
    .from('class_join_requests')
    .select(
      `
        id, class_id, student_id, status, requested_at, decided_at, decided_by,
        student:student_id ( full_name, email, avatar_url )
      `,
    )
    .eq('class_id', classId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });

  if (error) throw new Error(`Failed to list join requests: ${error.message}`);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    class_id: row.class_id,
    student_id: row.student_id,
    status: row.status,
    requested_at: row.requested_at,
    decided_at: row.decided_at,
    decided_by: row.decided_by,
    student_full_name: row.student?.full_name ?? null,
    student_email: row.student?.email ?? null,
    student_avatar_url: row.student?.avatar_url ?? null,
  }));
}

export async function decideJoinRequest(
  requestId: string,
  approve: boolean,
  classId: string,
): Promise<void> {
  const { supabase } = await requireAuthUserId();
  const { error } = await supabase.rpc('decide_join_request', {
    p_request_id: requestId,
    p_approve: approve,
  });
  if (error) throw new Error(`Failed to ${approve ? 'approve' : 'reject'} request: ${error.message}`);
  revalidatePath(`/teacher/classes/${classId}`);
}

export async function listClassRoster(
  classId: string,
): Promise<
  Array<{
    student_id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
    enrolled_at: string;
  }>
> {
  const { supabase } = await requireAuthUserId();
  const { data, error } = await supabase
    .from('class_enrollments')
    .select(
      `
        enrolled_at, student_id,
        student:student_id ( full_name, email, avatar_url )
      `,
    )
    .eq('class_id', classId)
    .order('enrolled_at', { ascending: true });

  if (error) throw new Error(`Failed to list roster: ${error.message}`);

  return (data ?? []).map((row: any) => ({
    student_id: row.student_id,
    full_name: row.student?.full_name ?? null,
    email: row.student?.email ?? null,
    avatar_url: row.student?.avatar_url ?? null,
    enrolled_at: row.enrolled_at,
  }));
}

export async function removeEnrollment(
  classId: string,
  studentId: string,
): Promise<void> {
  const { supabase } = await requireAuthUserId();
  const { error } = await supabase
    .from('class_enrollments')
    .delete()
    .eq('class_id', classId)
    .eq('student_id', studentId);
  if (error) throw new Error(`Failed to remove student: ${error.message}`);
  revalidatePath(`/teacher/classes/${classId}`);
}
// --------------------------------------------------------------------------
// STUDENT — class detail
// --------------------------------------------------------------------------

export type StudentClassDetail = {
  id: string;
  name: string;
  section: string | null;
  semester: string;
  color: string | null;
  cover_photo_url: string | null;
  description: string | null;
  teacher_name: string | null;
  enrolled_at: string;
};

export async function getStudentClassById(
  classId: string,
): Promise<StudentClassDetail | null> {
  const { supabase, userId } = await requireAuthUserId();

  const { data, error } = await supabase
    .from('class_enrollments')
    .select(
      `
        enrolled_at,
        classes:class_id (
          id, name, section, semester, color, cover_photo_url, description,
          teacher:teacher_id ( full_name )
        )
      `,
    )
    .eq('class_id', classId)
    .eq('student_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load class: ${error.message}`);
  if (!data) return null;

  const c: any = data.classes;
  if (!c) return null;

  return {
    id: c.id,
    name: c.name,
    section: c.section,
    semester: c.semester,
    color: c.color,
    cover_photo_url: c.cover_photo_url,
    description: c.description,
    teacher_name: c.teacher?.full_name ?? null,
    enrolled_at: data.enrolled_at,
  };
}
