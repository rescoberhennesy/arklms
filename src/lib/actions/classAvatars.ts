'use server';

import { createClient } from '@/lib/supabase/server';
import type { ClassAvatarInfo, ActionResult } from '@/types/class';

/**
 * Fetch up to a few enrolled student profiles for a class.
 *
 * Pass `excludeUserId` (the viewer's own id) to skip the viewer in the
 * returned list — used on the student-side cards so a student doesn't
 * see themselves in their own classmate avatar row. We fetch one extra
 * row when excluding so the visible count stays consistent.
 *
 * RLS guarantees: the caller must be the class's teacher OR an enrolled
 * student to see class_enrollments rows. We let RLS do the gate.
 */
export async function getClassAvatars(
  classId: string,
  excludeUserId?: string,
): Promise<ActionResult<ClassAvatarInfo[]>> {
  try {
    const supabase = await createClient();
    // 5 normally, 6 if we're excluding (one of them might be us)
    const fetchLimit = excludeUserId ? 6 : 5;

    const { data, error } = await supabase
      .from('class_enrollments')
      .select(
        'student:profiles!class_enrollments_student_id_fkey(id, full_name, email, avatar_url)',
      )
      .eq('class_id', classId)
      .order('enrolled_at', { ascending: true })
      .limit(fetchLimit);

    if (error) throw error;

    const avatars: ClassAvatarInfo[] = (data ?? [])
      .map((row: any) => row.student)
      .filter((s: any): s is ClassAvatarInfo => Boolean(s && s.id))
      .filter((s) => s.id !== excludeUserId)
      .slice(0, 5);

    return { ok: true, data: avatars };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to load class avatars' };
  }
}