// src/lib/actions/admin.ts
'use server';

import { createClient } from '@/lib/supabase/server';

// All actions here assume the caller is an admin. The /admin/* route
// layout gates access, and the underlying RLS policies also enforce
// admin-only reads. These functions don't re-check the role — but they
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
  activeSectionCount: number;
  archivedSectionCount: number;
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const { supabase } = await assertAuthed();

  const [teacherRes, studentRes, adminRes, activeRes, archivedRes] =
    await Promise.all([
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
  avatarUrl: string | null;
  createdAt: string;
  enrollmentCount: number;
}

export async function listAllStudents(): Promise<AdminStudentRow[]> {
  const { supabase } = await assertAuthed();

  const { data: profileRows, error: profErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, username, avatar_url, created_at')
    .eq('role', 'student');
  if (profErr) throw new Error(`Failed to load students: ${profErr.message}`);

  type ProfileRow = {
    id: string;
    full_name: string | null;
    email: string;
    username: string | null;
    avatar_url: string | null;
    created_at: string;
  };
  const students = (profileRows ?? []) as ProfileRow[];
  if (students.length === 0) return [];

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

  return students
    .map((s) => ({
      id: s.id,
      fullName: s.full_name,
      email: s.email,
      username: s.username,
      avatarUrl: s.avatar_url,
      createdAt: s.created_at,
      enrollmentCount: countByStudent.get(s.id) ?? 0,
    }))
    .sort((a, b) =>
      (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email),
    );
}

// --------------------------------------------------------------------------
// TEACHER LIST
// --------------------------------------------------------------------------

export interface AdminTeacherRow {
  id: string;
  fullName: string | null;
  email: string;
  username: string | null;
  avatarUrl: string | null;
  createdAt: string;
  classCount: number;
  activeClassCount: number;
}

export async function listAllTeachers(): Promise<AdminTeacherRow[]> {
  const { supabase } = await assertAuthed();

  const { data: profileRows, error: profErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, username, avatar_url, created_at')
    .eq('role', 'teacher');
  if (profErr) throw new Error(`Failed to load teachers: ${profErr.message}`);

  type ProfileRow = {
    id: string;
    full_name: string | null;
    email: string;
    username: string | null;
    avatar_url: string | null;
    created_at: string;
  };
  const teachers = (profileRows ?? []) as ProfileRow[];
  if (teachers.length === 0) return [];

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

  return teachers
    .map((t) => ({
      id: t.id,
      fullName: t.full_name,
      email: t.email,
      username: t.username,
      avatarUrl: t.avatar_url,
      createdAt: t.created_at,
      classCount: totalByTeacher.get(t.id) ?? 0,
      activeClassCount: activeByTeacher.get(t.id) ?? 0,
    }))
    .sort((a, b) =>
      (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email),
    );
}

// --------------------------------------------------------------------------
// SECTIONS  (derived: classes grouped by section + grade_level + track)
// --------------------------------------------------------------------------

export interface AdminSectionRow {
  key: string;
  section: string | null;
  gradeLevel: string | null;
  track: string | null;
  classCount: number;
  studentCount: number;
  teacherNames: string[];
}

export async function listAllSections(): Promise<AdminSectionRow[]> {
  const { supabase } = await assertAuthed();

  const { data: classRows, error: classErr } = await supabase
    .from('classes')
    .select(
      'id, section, grade_level, track, ' +
        'teacher:profiles!classes_teacher_id_fkey(full_name, email), ' +
        'class_enrollments(student_id)',
    );
  if (classErr) {
    throw new Error(`Failed to load sections: ${classErr.message}`);
  }

  type Row = {
    id: string;
    section: string | null;
    grade_level: string | null;
    track: string | null;
    teacher: { full_name: string | null; email: string } | null;
    class_enrollments: Array<{ student_id: string }> | null;
  };

  const groups = new Map<
    string,
    {
      section: string | null;
      gradeLevel: string | null;
      track: string | null;
      classCount: number;
      students: Set<string>;
      teachers: Set<string>;
    }
  >();

 for (const r of ((classRows ?? []) as unknown) as Row[]) {
    const key = `${r.section ?? ''}|${r.grade_level ?? ''}|${r.track ?? ''}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        section: r.section,
        gradeLevel: r.grade_level,
        track: r.track,
        classCount: 0,
        students: new Set<string>(),
        teachers: new Set<string>(),
      };
      groups.set(key, g);
    }
    g.classCount += 1;
    for (const e of r.class_enrollments ?? []) {
      g.students.add(e.student_id);
    }
    if (r.teacher) {
      g.teachers.add(r.teacher.full_name || r.teacher.email);
    }
  }

  return Array.from(groups.entries())
    .map(([key, g]) => ({
      key,
      section: g.section,
      gradeLevel: g.gradeLevel,
      track: g.track,
      classCount: g.classCount,
      studentCount: g.students.size,
      teacherNames: Array.from(g.teachers).sort(),
    }))
    .sort((a, b) => (a.section ?? '').localeCompare(b.section ?? ''));
}