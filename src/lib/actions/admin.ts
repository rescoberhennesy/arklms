
// src/lib/actions/admin.ts
'use server';

import { createClient } from '@/lib/supabase/server';

// All actions here assume the caller is an admin. The /admin/* route
// layout (src/app/(dashboard)/admin/layout.tsx) gates access, and the
// underlying RLS policies (profiles "Admins can view all profiles" /
// "profiles_staff_view", classes "classes_select_admin",
// class_enrollments "enrollments_select_admin") also enforce admin-only
// reads. These functions therefore don't re-check the role — but they
// DO require an authenticated session and will throw otherwise.

async function assertAuthed() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  if (!user) throw new Error('Not authenticated');
  return { supabase, user };
}

// --------------------------------------------------------------------------
// DASHBOARD STATS
// --------------------------------------------------------------------------

export interface AdminDashboardStats {
  teacherCount: number;
  studentCount: number;
  adminCount: number;
  activeSectionCount: number; // classes where is_archived = false
  archivedSectionCount: number;
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const { supabase } = await assertAuthed();

  const [
    teacherRes,
    studentRes,
    adminRes,
    activeRes,
    archivedRes,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'teacher'),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student'),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin'),
    supabase
      .from('classes')
      .select('id', { count: 'exact', head: true })
      .eq('is_archived', false),
    supabase
      .from('classes')
      .select('id', { count: 'exact', head: true })
      .eq('is_archived', true),
  ]);

  // If any count query errored, surface it rather than silently showing 0.
  const firstError =
    teacherRes.error ??
    studentRes.error ??
    adminRes.error ??
    activeRes.error ??
    archivedRes.error;
  if (firstError) {
    throw new Error(`Failed to load admin stats: ${firstError.message}`);
  }

  return {
    teacherCount: teacherRes.count ?? 0,
    studentCount: studentRes.count ?? 0,
    adminCount: adminRes.count ?? 0,
    activeSectionCount: activeRes.count ?? 0,
    archivedSectionCount: archivedRes.count ?? 0,
  };
}

// --------------------------------------------------------------------------
// STUDENT LIST
// --------------------------------------------------------------------------

export interface AdminStudentRow {
  id: string;
  fullName: string | null;
  email: string;
  username: string | null;
  createdAt: string;
  enrollmentCount: number; // number of class_enrollments rows for this student
}

export async function listAllStudents(): Promise<AdminStudentRow[]> {
  const { supabase } = await assertAuthed();

  const { data: profileRows, error: profErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, username, created_at')
    .eq('role', 'student')
    .order('created_at', { ascending: false });
  if (profErr) throw new Error(`Failed to load students: ${profErr.message}`);

  type ProfileRow = {
    id: string;
    full_name: string | null;
    email: string;
    username: string | null;
    created_at: string;
  };
  const students = (profileRows ?? []) as ProfileRow[];
  if (students.length === 0) return [];

  // Enrollment counts: pull all enrollment rows for these students and
  // tally in memory. One round trip; admin RLS allows the full select.
  const studentIds = students.map((s) => s.id);
  const { data: enrollmentRows, error: enrErr } = await supabase
    .from('class_enrollments')
    .select('student_id')
    .in('student_id', studentIds);
  if (enrErr) {
    throw new Error(`Failed to load enrollment counts: ${enrErr.message}`);
  }

  const countByStudent = new Map<string, number>();
  for (const r of (enrollmentRows ?? []) as Array<{ student_id: string }>) {
    countByStudent.set(
      r.student_id,
      (countByStudent.get(r.student_id) ?? 0) + 1,
    );
  }

  return students.map((s) => ({
    id: s.id,
    fullName: s.full_name,
    email: s.email,
    username: s.username,
    createdAt: s.created_at,
    enrollmentCount: countByStudent.get(s.id) ?? 0,
  }));
}

// --------------------------------------------------------------------------
// TEACHER LIST
// --------------------------------------------------------------------------

export interface AdminTeacherRow {
  id: string;
  fullName: string | null;
  email: string;
  username: string | null;
  createdAt: string;
  classCount: number; // number of classes owned (any archive state)
  activeClassCount: number; // classes where is_archived = false
}

export async function listAllTeachers(): Promise<AdminTeacherRow[]> {
  const { supabase } = await assertAuthed();

  const { data: profileRows, error: profErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, username, created_at')
    .eq('role', 'teacher')
    .order('created_at', { ascending: false });
  if (profErr) throw new Error(`Failed to load teachers: ${profErr.message}`);

  type ProfileRow = {
    id: string;
    full_name: string | null;
    email: string;
    username: string | null;
    created_at: string;
  };
  const teachers = (profileRows ?? []) as ProfileRow[];
  if (teachers.length === 0) return [];

  // Class counts: pull all classes owned by these teachers and tally.
  const teacherIds = teachers.map((t) => t.id);
  const { data: classRows, error: classErr } = await supabase
    .from('classes')
    .select('teacher_id, is_archived')
    .in('teacher_id', teacherIds);
  if (classErr) {
    throw new Error(`Failed to load class counts: ${classErr.message}`);
  }

  const totalByTeacher = new Map<string, number>();
  const activeByTeacher = new Map<string, number>();
  for (const r of (classRows ?? []) as Array<{
    teacher_id: string;
    is_archived: boolean;
  }>) {
    totalByTeacher.set(
      r.teacher_id,
      (totalByTeacher.get(r.teacher_id) ?? 0) + 1,
    );
    if (!r.is_archived) {
      activeByTeacher.set(
        r.teacher_id,
        (activeByTeacher.get(r.teacher_id) ?? 0) + 1,
      );
    }
  }

  return teachers.map((t) => ({
    id: t.id,
    fullName: t.full_name,
    email: t.email,
    username: t.username,
    createdAt: t.created_at,
    classCount: totalByTeacher.get(t.id) ?? 0,
    activeClassCount: activeByTeacher.get(t.id) ?? 0,
  }));
}
