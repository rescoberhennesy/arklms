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
  activeSectionCount: number;
  studentsByTrack: Array<{ track: string; count: number }>;
  studentsByGradeLevel: Array<{ gradeLevel: string; count: number }>;
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const { supabase } = await assertAuthed();

  const [teacherRes, studentRes, activeRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'teacher'),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student'),
    supabase
      .from('classes')
      .select('id', { count: 'exact', head: true })
      .eq('is_archived', false),
  ]);

  const firstError = teacherRes.error ?? studentRes.error ?? activeRes.error;
  if (firstError) {
    throw new Error(`Failed to load admin stats: ${firstError.message}`);
  }

  // Distribution by track + grade level. We derive from class_enrollments
  // joined with the class's track/grade_level (same pattern as listAllStudents).
  // A student counted once per distinct track/grade they're enrolled in.
  const { data: distRows, error: distErr } = await supabase
    .from('class_enrollments')
    .select('student_id, class:classes(track, grade_level)');
  if (distErr) {
    throw new Error(`Failed to load distribution: ${distErr.message}`);
  }

  type DistRow = {
    student_id: string;
    class: { track: string | null; grade_level: string | null } | null;
  };

  const tracksByStudent = new Map<string, Set<string>>();
  const gradesByStudent = new Map<string, Set<string>>();
  for (const r of (distRows ?? []) as unknown as DistRow[]) {
    if (r.class?.track) {
      const set = tracksByStudent.get(r.student_id) ?? new Set<string>();
      set.add(r.class.track);
      tracksByStudent.set(r.student_id, set);
    }
    if (r.class?.grade_level) {
      const set = gradesByStudent.get(r.student_id) ?? new Set<string>();
      set.add(r.class.grade_level);
      gradesByStudent.set(r.student_id, set);
    }
  }

  const trackCounts = new Map<string, number>();
  for (const tracks of tracksByStudent.values()) {
    for (const t of tracks) {
      trackCounts.set(t, (trackCounts.get(t) ?? 0) + 1);
    }
  }
  const gradeCounts = new Map<string, number>();
  for (const grades of gradesByStudent.values()) {
    for (const g of grades) {
      gradeCounts.set(g, (gradeCounts.get(g) ?? 0) + 1);
    }
  }

  return {
    teacherCount: teacherRes.count ?? 0,
    studentCount: studentRes.count ?? 0,
    activeSectionCount: activeRes.count ?? 0,
    studentsByTrack: Array.from(trackCounts.entries())
      .map(([track, count]) => ({ track, count }))
      .sort((a, b) => b.count - a.count),
    studentsByGradeLevel: Array.from(gradeCounts.entries())
      .map(([gradeLevel, count]) => ({ gradeLevel, count }))
      .sort((a, b) => a.gradeLevel.localeCompare(b.gradeLevel)),
  };
}
// --------------------------------------------------------------------------
// STUDENT LIST
// --------------------------------------------------------------------------

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
  // Track is derived from the student's enrolled class. A student is
  // expected to be in exactly one section/track, but in case of multiple
  // enrollments we collect the distinct tracks here.
  tracks: string[];
  // Grade level is also derived from the enrolled class, same pattern as track.
  gradeLevels: string[];
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

  // Fetch enrollments WITH the class's track + grade_level in one join.
  const { data: enrollmentRows, error: enrErr } = await supabase
    .from('class_enrollments')
    .select('student_id, class:classes(track, grade_level)')
    .in('student_id', studentIds);
  if (enrErr) {
    throw new Error(`Failed to load enrollments: ${enrErr.message}`);
  }

  type EnrollmentRow = {
    student_id: string;
    class: { track: string | null; grade_level: string | null } | null;
  };

  const countByStudent = new Map<string, number>();
  const tracksByStudent = new Map<string, Set<string>>();
  const gradesByStudent = new Map<string, Set<string>>();
  for (const r of (enrollmentRows ?? []) as unknown as EnrollmentRow[]) {
    countByStudent.set(
      r.student_id,
      (countByStudent.get(r.student_id) ?? 0) + 1,
    );
    if (r.class?.track) {
      const set = tracksByStudent.get(r.student_id) ?? new Set<string>();
      set.add(r.class.track);
      tracksByStudent.set(r.student_id, set);
    }
    if (r.class?.grade_level) {
      const set = gradesByStudent.get(r.student_id) ?? new Set<string>();
      set.add(r.class.grade_level);
      gradesByStudent.set(r.student_id, set);
    }
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
      tracks: Array.from(tracksByStudent.get(s.id) ?? []).sort(),
      gradeLevels: Array.from(gradesByStudent.get(s.id) ?? []).sort(),
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

// --------------------------------------------------------------------------
// SECTIONS  (derived: classes grouped by section + grade_level + track)
// --------------------------------------------------------------------------

export interface SectionStudent {
  id: string;
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
}

export interface AdminSectionRow {
  key: string;
  section: string | null;
  gradeLevel: string | null;
  track: string | null;
  classCount: number;
  studentCount: number;
  teacherNames: string[];
  students: SectionStudent[];
}

export async function listAllSections(): Promise<AdminSectionRow[]> {
  const { supabase } = await assertAuthed();

  const { data: classRows, error: classErr } = await supabase
    .from('classes')
    .select(
      'id, section, grade_level, track, ' +
        'teacher:profiles!classes_teacher_id_fkey(full_name, email), ' +
        'class_enrollments(student_id, student:profiles!class_enrollments_student_id_fkey(id, full_name, email, avatar_url))',
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
    class_enrollments:
      | Array<{
          student_id: string;
          student: {
            id: string;
            full_name: string | null;
            email: string;
            avatar_url: string | null;
          } | null;
        }>
      | null;
  };

  const groups = new Map <
    string,
    {
      section: string | null;
      gradeLevel: string | null;
      track: string | null;
      classCount: number;
      studentsById: Map<string, SectionStudent>;
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
        studentsById: new Map<string, SectionStudent>(),
        teachers: new Set<string>(),
      };
      groups.set(key, g);
    }
    g.classCount += 1;
    for (const e of r.class_enrollments ?? []) {
      if (e.student && !g.studentsById.has(e.student.id)) {
        g.studentsById.set(e.student.id, {
          id: e.student.id,
          fullName: e.student.full_name,
          email: e.student.email,
          avatarUrl: e.student.avatar_url,
        });
      }
    }
    if (r.teacher) {
      g.teachers.add(r.teacher.full_name || r.teacher.email);
    }
  }

  return Array.from(groups.entries())
    .map(([key, g]) => {
      const students = Array.from(g.studentsById.values()).sort((a, b) =>
        (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email),
      );
      return {
        key,
        section: g.section,
        gradeLevel: g.gradeLevel,
        track: g.track,
        classCount: g.classCount,
        studentCount: students.length,
        teacherNames: Array.from(g.teachers).sort(),
        students,
      };
    })
    .sort((a, b) => (a.section ?? '').localeCompare(b.section ?? ''));
}

// --------------------------------------------------------------------------
// RECENT ACTIVITY FEED
// --------------------------------------------------------------------------

export type AdminActivityKind =
  | 'profile_created'
  | 'class_created'
  | 'class_archived'
  | 'enrollment_created';

export interface AdminActivityItem {
  id: string;
  kind: AdminActivityKind;
  at: string; // ISO timestamp
  // Pre-formatted bits the UI can render however it wants.
  primary: string; // e.g. "Justine Lee"
  secondary: string | null; // e.g. "joined Harmonia - A"
  role?: 'admin' | 'teacher' | 'student' | null;
}

export async function getAdminRecentActivity(
  limit = 10,
): Promise<AdminActivityItem[]> {
  const { supabase } = await assertAuthed();

  // Pull a generous slice from each source, merge in memory, then trim.
  // This avoids needing a unified audit log table.
  const sliceSize = Math.max(limit * 2, 20);

  const [profilesRes, classesRes, enrollmentsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, role, created_at')
      .order('created_at', { ascending: false })
      .limit(sliceSize),
    supabase
      .from('classes')
      .select('id, name, section, is_archived, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(sliceSize),
    supabase
      .from('class_enrollments')
      .select(
        'student_id, class_id,  enrolled_at, ' +
          'student:profiles!class_enrollments_student_id_fkey(full_name, email), ' +
          'class:classes(name, section)',
      )
      .order('enrolled_at', { ascending: false })
      .limit(sliceSize),
  ]);

  const firstError =
    profilesRes.error ?? classesRes.error ?? enrollmentsRes.error;
  if (firstError) {
    throw new Error(`Failed to load activity: ${firstError.message}`);
  }

  const items: AdminActivityItem[] = [];

  type ProfileRow = {
    id: string;
    full_name: string | null;
    email: string;
    role: 'admin' | 'teacher' | 'student';
    created_at: string;
  };
  for (const p of (profilesRes.data ?? []) as ProfileRow[]) {
    items.push({
      id: `profile-${p.id}`,
      kind: 'profile_created',
      at: p.created_at,
      primary: p.full_name ?? p.email,
      secondary: `joined as ${p.role}`,
      role: p.role,
    });
  }

  type ClassRow = {
    id: string;
    name: string;
    section: string | null;
    is_archived: boolean;
    created_at: string;
    updated_at: string;
  };
  for (const c of (classesRes.data ?? []) as ClassRow[]) {
    const label = c.section ? `${c.name} (${c.section})` : c.name;
    items.push({
      id: `class-created-${c.id}`,
      kind: 'class_created',
      at: c.created_at,
      primary: label,
      secondary: 'class created',
    });
    if (c.is_archived && c.updated_at !== c.created_at) {
      items.push({
        id: `class-archived-${c.id}`,
        kind: 'class_archived',
        at: c.updated_at,
        primary: label,
        secondary: 'class archived',
      });
    }
  }

  type EnrollmentRow = {
    student_id: string;
    class_id: string;
    enrolled_at: string;
    student: { full_name: string | null; email: string } | null;
    class: { name: string; section: string | null } | null;
  };
  for (const e of (enrollmentsRes.data ??
    []) as unknown as EnrollmentRow[]) {
    if (!e.student || !e.class) continue;
    const classLabel = e.class.section
      ? `${e.class.name} (${e.class.section})`
      : e.class.name;
    items.push({
      id: `enroll-${e.student_id}-${e.class_id}`,
      kind: 'enrollment_created',
      at: e.enrolled_at,
      primary: e.student.full_name ?? e.student.email,
      secondary: `joined ${classLabel}`,
      role: 'student',
    });
  }

  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

// --------------------------------------------------------------------------
// CHART DATA — daily counts for the last 30 days
// --------------------------------------------------------------------------

export interface AdminChartData {
  // Daily series for the last 30 days. Each entry has the date in
  // 'YYYY-MM-DD' and counts that may be zero — the buckets are dense so
  // the chart axis doesn't have gaps.
  signupsDaily: Array<{
    date: string;
    students: number;
    teachers: number;
  }>;
  classCreationDaily: Array<{
    date: string;
    classes: number;
  }>;
  trackDistribution: Array<{
    track: string;
    count: number;
  }>;
}

const CHART_WINDOW_DAYS = 30;

// Returns ISO date (YYYY-MM-DD) in UTC. Daily buckets are UTC-based so
// the chart is timezone-stable regardless of who's viewing it.
function isoDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getAdminChartData(): Promise<AdminChartData> {
  const { supabase } = await assertAuthed();

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (CHART_WINDOW_DAYS - 1));
  since.setUTCHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  const [profilesRes, classesRes, distRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('role, created_at')
      .in('role', ['student', 'teacher'])
      .gte('created_at', sinceIso),
    supabase
      .from('classes')
      .select('created_at')
      .gte('created_at', sinceIso),
    // For the donut/pie: distribution snapshot, NOT time-series.
    // Same derivation as getAdminDashboardStats so the numbers agree.
    supabase
      .from('class_enrollments')
      .select('student_id, class:classes(track)'),
  ]);

  const firstError =
    profilesRes.error ?? classesRes.error ?? distRes.error;
  if (firstError) {
    throw new Error(`Failed to load chart data: ${firstError.message}`);
  }

  // Build dense daily buckets for the entire window.
  const signupBuckets = new Map<string, { students: number; teachers: number }>();
  const classBuckets = new Map<string, number>();
  for (let i = 0; i < CHART_WINDOW_DAYS; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    const key = isoDateKey(d);
    signupBuckets.set(key, { students: 0, teachers: 0 });
    classBuckets.set(key, 0);
  }

  type ProfileRow = { role: 'student' | 'teacher'; created_at: string };
  for (const p of (profilesRes.data ?? []) as ProfileRow[]) {
    const key = isoDateKey(new Date(p.created_at));
    const bucket = signupBuckets.get(key);
    if (!bucket) continue;
    if (p.role === 'student') bucket.students += 1;
    else if (p.role === 'teacher') bucket.teachers += 1;
  }

  type ClassRow = { created_at: string };
  for (const c of (classesRes.data ?? []) as ClassRow[]) {
    const key = isoDateKey(new Date(c.created_at));
    if (!classBuckets.has(key)) continue;
    classBuckets.set(key, (classBuckets.get(key) ?? 0) + 1);
  }

  const signupsDaily = Array.from(signupBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, students: v.students, teachers: v.teachers }));

  const classCreationDaily = Array.from(classBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, classes]) => ({ date, classes }));

  // Track distribution: students counted once per distinct track.
  type DistRow = {
    student_id: string;
    class: { track: string | null } | null;
  };
  const tracksByStudent = new Map<string, Set<string>>();
  for (const r of (distRes.data ?? []) as unknown as DistRow[]) {
    if (!r.class?.track) continue;
    const set = tracksByStudent.get(r.student_id) ?? new Set<string>();
    set.add(r.class.track);
    tracksByStudent.set(r.student_id, set);
  }
  const trackCounts = new Map<string, number>();
  for (const tracks of tracksByStudent.values()) {
    for (const t of tracks) {
      trackCounts.set(t, (trackCounts.get(t) ?? 0) + 1);
    }
  }
  const trackDistribution = Array.from(trackCounts.entries())
    .map(([track, count]) => ({ track, count }))
    .sort((a, b) => b.count - a.count);

  return {
    signupsDaily,
    classCreationDaily,
    trackDistribution,
  };
}