'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult, ClassAvatarInfo } from '@/types/class';

export interface ClassPeople {
  teacher: ClassAvatarInfo | null;
  classmates: ClassAvatarInfo[];
}

/**
 * Fetch the teacher's profile + all classmate profiles for a class.
 * Self is excluded from classmates so the student doesn't see themselves.
 *
 * RLS guarantees:
 *   - `enrollments_select_classmate` lets the caller read peer enrollment rows
 *     in any class they're enrolled in (added in migration 20260516120000).
 *   - `profiles_classmate_view` lets the caller read those joined profile rows
 *     (added in migration 20260508010000).
 *
 * Returns an error result only on hard failure (no auth, query error).
 * Empty classmates array is a valid state (you're the only student).
 */
export async function getClassPeople(
  classId: string,
): Promise<ActionResult<ClassPeople>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    // Teacher: join classes → profiles via teacher_id
    const { data: classRow, error: classErr } = await supabase
      .from('classes')
      .select(
        'teacher:profiles!classes_teacher_id_fkey(id, full_name, email, avatar_url)',
      )
      .eq('id', classId)
      .maybeSingle();

    if (classErr) throw classErr;

    const teacher: ClassAvatarInfo | null =
      (classRow as any)?.teacher && (classRow as any).teacher.id
        ? ((classRow as any).teacher as ClassAvatarInfo)
        : null;

    // Classmates: all enrollments in this class, joined to profiles, minus self
    const { data: enrollRows, error: enrollErr } = await supabase
      .from('class_enrollments')
      .select(
        'student:profiles!class_enrollments_student_id_fkey(id, full_name, email, avatar_url)',
      )
      .eq('class_id', classId)
      .order('enrolled_at', { ascending: true });

    if (enrollErr) throw enrollErr;

    const classmates: ClassAvatarInfo[] = (enrollRows ?? [])
      .map((row: any) => row.student)
      .filter((s: any): s is ClassAvatarInfo => Boolean(s && s.id))
      .filter((s) => s.id !== user.id);

    return { ok: true, data: { teacher, classmates } };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to load class people' };
  }
}