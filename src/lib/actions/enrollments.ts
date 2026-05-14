
// src/lib/actions/enrollments.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type {
  PendingJoinRequest,
  StudentClassListItem,
} from '@/types/class';
import { notifyJoinRequestCreated } from '@/lib/actions/notifications';
import { notifyJoinRequestDecided } from '@/lib/actions/notifications';

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
  const { supabase, userId } = await requireAuthUserId();

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

  // Notification fan-out (Session 13). A new pending request was created
  // (kind === 'pending'); notify the class teacher. ref_id is the class_id
  // rather than the request_id because the RPC doesn't return the latter.
  // Teacher click-through lands on the students tab where the request shows.
 // Notification fan-out (Session 13). A new pending request was created
  // (kind === 'pending'); notify the class teacher. ref_id is the class_id
  // rather than the request_id because the RPC doesn't return the latter.
  // Teacher click-through lands on the students tab where the request shows.
  //
  // Class name + teacher_id come via get_join_request_class_meta (a scoped
  // SECURITY DEFINER fn): the student isn't enrolled yet, so a direct
  // classes select would be hidden by RLS and return null -- which used to
  // silently skip this whole block and the teacher never got notified.
  try {
    const { data: metaData, error: metaErr } = await supabase.rpc(
      'get_join_request_class_meta',
      { p_class_id: classId },
    );
    if (metaErr) {
      console.error('[enrollments] join request class meta error:', metaErr.message);
    }
    const meta = (Array.isArray(metaData) ? metaData[0] : metaData) as
      | { class_name: string; teacher_id: string }
      | null
      | undefined;
    if (meta) {
      const { data: studentRow } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', userId)
        .maybeSingle();
      const student = studentRow as { full_name: string | null; email: string } | null;
      const studentName = student?.full_name?.trim() || student?.email || 'A student';
      await notifyJoinRequestCreated({
        requestId: classId,
        classId,
        className: meta.class_name,
        teacherId: meta.teacher_id,
        studentName,
      });
    }
  } catch (e) {
    console.error('[enrollments] join request notify error:', e);
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
    .order('display_order', { ascending: true });

  if (error) throw new Error(`Failed to list enrolled classes: ${error.message}`);

  // Active classes first, archived after. Each block keeps the student's
  // drag order via display_order (already the .order above). The two-pass
  // sort below partitions by is_archived without disturbing inner order.
  const items = (data ?? [])
    .map((row: any) => {
      const c = row.classes;
      if (!c) return null;
      return {
        id: c.id,
        name: c.name,
        section: c.section,
        semester: c.semester,
        color: c.color,
        cover_photo_url: c.cover_photo_url,
        teacher_name: c.teacher?.full_name ?? null,
        enrolled_at: row.enrolled_at,
        is_archived: c.is_archived,
      } as StudentClassListItem;
    })
    .filter((x): x is StudentClassListItem => x !== null);

  return [
    ...items.filter((c) => !c.is_archived),
    ...items.filter((c) => c.is_archived),
  ];
}

export async function listMyPendingRequests(): Promise <
  Array<{ id: string; class_id: string; class_name: string; requested_at: string }>
> {
  const { supabase } = await requireAuthUserId();

  // Uses the get_my_join_requests() SECURITY DEFINER function rather than a
  // direct select with an embedded classes join: a pending-request student
  // isn't enrolled, so classes RLS hides the class row and the embedded join
  // would return a null name ("(unknown class)"). The function is scoped to
  // student_id = auth.uid() internally.
  const { data, error } = await supabase.rpc('get_my_join_requests');

  if (error) throw new Error(`Failed to list pending requests: ${error.message}`);

  return (data ?? [])
    .filter((row: any) => row.status === 'pending')
    .sort(
      (a: any, b: any) =>
        new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime(),
    )
    .map((row: any) => ({
      id: row.id,
      class_id: row.class_id,
      class_name: row.class_name ?? '(unknown class)',
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

export async function countPendingJoinRequests(classId: string): Promise<number> {
  const { supabase } = await requireAuthUserId();
  const { count, error } = await supabase
    .from('class_join_requests')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId)
    .eq('status', 'pending');

  if (error) throw new Error(`Failed to count join requests: ${error.message}`);
  return count ?? 0;
}

export async function decideJoinRequest(
  requestId: string,
  approve: boolean,
  classId: string,
): Promise<void> {
  const { supabase } = await requireAuthUserId();

  // Read the request row BEFORE deciding — decide_join_request may delete
  // or alter it, and we need student_id for the notification.
  const { data: reqRow } = await supabase
    .from('class_join_requests')
    .select('student_id')
    .eq('id', requestId)
    .maybeSingle();

  const { error } = await supabase.rpc('decide_join_request', {
    p_request_id: requestId,
    p_approve: approve,
  });
  if (error) throw new Error(`Failed to ${approve ? 'approve' : 'reject'} request: ${error.message}`);
  revalidatePath(`/teacher/classes/${classId}`);

  // Notification fan-out (Session 13). Tell the student the outcome.
  const student = reqRow as { student_id: string } | null;
  if (student) {
    try {
      const { data: classRow } = await supabase
        .from('classes')
        .select('name')
        .eq('id', classId)
        .maybeSingle();
      const className = (classRow as { name: string } | null)?.name ?? 'a class';
      await notifyJoinRequestDecided({
        requestId,
        classId,
        className,
        studentId: student.student_id,
        decision: approve ? 'approved' : 'rejected',
      });
    } catch (e) {
      console.error('[enrollments] decide notify error:', e);
    }
  }
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
    last_active_at: string | null;
  }>
> {
  const { supabase } = await requireAuthUserId();
  const { data, error } = await supabase
    .from('class_enrollments')
    .select(
      `
        enrolled_at, student_id,
        student:student_id ( full_name, email, avatar_url, last_active_at )
      `,
    )
    .eq('class_id', classId)
    .order('enrolled_at', { ascending: true });

  if (error) throw new Error(`Failed to list roster: ${error.message}`);

  return (data ?? [])
    .map((row: any) => ({
      student_id: row.student_id,
      full_name: row.student?.full_name ?? null,
      email: row.student?.email ?? null,
      avatar_url: row.student?.avatar_url ?? null,
      enrolled_at: row.enrolled_at,
      last_active_at: row.student?.last_active_at ?? null,
    }))
    .sort((a, b) => {
      // Alphabetical by display name; fall back to email so rows with no
      // full_name still sort sensibly. Case-insensitive.
      const an = (a.full_name ?? a.email ?? '').toLowerCase();
      const bn = (b.full_name ?? b.email ?? '').toLowerCase();
      return an.localeCompare(bn);
    });
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


export async function reorderMyEnrollments(orderedClassIds: string[]): Promise<void> {
  const { supabase } = await requireAuthUserId();
  const { error } = await supabase.rpc('reorder_my_enrollments', {
    p_class_ids: orderedClassIds,
  });
  if (error) throw new Error(`Failed to reorder enrollments: ${error.message}`);
}


export async function leaveClass(classId: string): Promise<void> {
  const { supabase, userId } = await requireAuthUserId();
  const { error } = await supabase
    .from('class_enrollments')
    .delete()
    .eq('class_id', classId)
    .eq('student_id', userId);
  if (error) throw new Error(`Failed to leave class: ${error.message}`);
}


export async function listMyRejectedRequests(): Promise <
  Array<{ id: string; class_id: string; class_name: string; decided_at: string }>
> {
  const { supabase } = await requireAuthUserId();

  // Same rationale as listMyPendingRequests: a rejected-request student isn't
  // enrolled, so the class name has to come through the SECURITY DEFINER
  // function rather than an RLS'd embedded join.
  const { data, error } = await supabase.rpc('get_my_join_requests');

  if (error) throw new Error(`Failed to list rejected requests: ${error.message}`);

  return (data ?? [])
    .filter((row: any) => row.status === 'rejected' && row.decided_at !== null)
    .sort(
      (a: any, b: any) =>
        new Date(b.decided_at).getTime() - new Date(a.decided_at).getTime(),
    )
    .map((row: any) => ({
      id: row.id,
      class_id: row.class_id,
      class_name: row.class_name ?? '(unknown class)',
      decided_at: row.decided_at,
    }));
}

export async function dismissRejectedRequest(requestId: string): Promise<void> {
  const { supabase } = await requireAuthUserId();
  const { error } = await supabase
    .from('class_join_requests')
    .delete()
    .eq('id', requestId)
    .eq('status', 'rejected');
  if (error) throw new Error(`Failed to dismiss request: ${error.message}`);
  revalidatePath('/student/classes');
  revalidatePath('/student/dashboard');
}
