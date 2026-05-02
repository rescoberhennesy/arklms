'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type {
  ClassFormInput,
  ClassRow,
  TeacherClassListItem,
  InviteExpirationHours,
  Semester,
  ActionResult,
} from '@/types/class';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

async function requireAuthUserId() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect('/');
  return { supabase, userId: user.id };
}

function validateSemester(value: unknown): Semester {
  if (value === '1st Semester' || value === '2nd Semester') return value;
  throw new Error('Semester must be either "1st Semester" or "2nd Semester"');
}

// --------------------------------------------------------------------------
// READS
// --------------------------------------------------------------------------

export async function listMyClasses(): Promise<ActionResult<TeacherClassListItem[]>> {
  try {
    const { supabase, userId } = await requireAuthUserId();

    const { data, error } = await supabase
      .from('classes')
      .select(`*, class_enrollments(count)`)
      .eq('teacher_id', userId)
      .order('is_archived', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formatted = (data ?? []).map((row: any) => {
      const enrolled_count = row.class_enrollments?.[0]?.count ?? 0;
      const { class_enrollments: _drop, ...rest } = row;
      return { ...rest, enrolled_count } as TeacherClassListItem;
    });

    return { ok: true, data: formatted };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to list classes' };
  }
}

export async function getClassById(id: string): Promise<ActionResult<ClassRow | null>> {
  try {
    const { supabase } = await requireAuthUserId();
    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return { ok: true, data: data as ClassRow | null };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to load class' };
  }
}

export async function listMySectionSuggestions(): Promise<ActionResult<string[]>> {
  try {
    const { supabase, userId } = await requireAuthUserId();
    const { data, error } = await supabase
      .from('classes')
      .select('section')
      .eq('teacher_id', userId)
      .not('section', 'is', null);

    if (error) throw error;
    const set = new Set<string>((data ?? []).map((r: any) => r.section).filter(Boolean));
    return { ok: true, data: Array.from(set).sort() };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to list sections' };
  }
}

export async function listMyClassNameSuggestions(): Promise<ActionResult<string[]>> {
  try {
    const { supabase, userId } = await requireAuthUserId();
    const { data, error } = await supabase
      .from('classes')
      .select('name')
      .eq('teacher_id', userId);

    if (error) throw error;
    const set = new Set<string>((data ?? []).map((r: any) => r.name).filter(Boolean));
    return { ok: true, data: Array.from(set).sort() };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to list class names' };
  }
}

// --------------------------------------------------------------------------
// WRITES
// --------------------------------------------------------------------------

export async function createClass(input: ClassFormInput): Promise<ActionResult<ClassRow>> {
  try {
    const { supabase, userId } = await requireAuthUserId();
    const semester = validateSemester(input.semester);

    const { data: codeData, error: codeError } = await supabase.rpc('generate_invite_code');
    if (codeError) throw codeError;

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('classes')
      .insert({
        teacher_id: userId,
        name: input.name.trim(),
        section: input.section?.trim() || null,
        semester,
        description: input.description?.trim() || null,
        color: input.color ?? null,
        cover_photo_url: input.cover_photo_url ?? null,
        invite_code: codeData as string,
        invite_code_expires_at: expiresAt,
        is_archived: false,
      })
      .select('*')
      .single();

    if (error) throw error;

    revalidatePath('/teacher/classes');
    revalidatePath('/teacher/dashboard');
    return { ok: true, data: data as ClassRow };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to create class' };
  }
}

export async function updateClass(id: string, input: ClassFormInput): Promise<ActionResult<ClassRow>> {
  try {
    const { supabase } = await requireAuthUserId();
    const semester = validateSemester(input.semester);

    const { data, error } = await supabase
      .from('classes')
      .update({
        name: input.name.trim(),
        section: input.section?.trim() || null,
        semester,
        description: input.description?.trim() || null,
        color: input.color ?? null,
        cover_photo_url: input.cover_photo_url ?? null,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    revalidatePath('/teacher/classes');
    revalidatePath(`/teacher/classes/${id}`);
    return { ok: true, data: data as ClassRow };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to update class' };
  }
}

export async function setClassArchived(id: string, archived: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await requireAuthUserId();
    const { error } = await supabase.from('classes').update({ is_archived: archived }).eq('id', id);
    if (error) throw error;
    revalidatePath('/teacher/classes');
    revalidatePath(`/teacher/classes/${id}`);
    return { ok: true, data: undefined };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to archive/unarchive' };
  }
}

export async function deleteClass(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireAuthUserId();
    const { error } = await supabase.from('classes').delete().eq('id', id);
    if (error) throw error;
    revalidatePath('/teacher/classes');
    revalidatePath('/teacher/dashboard');
    return { ok: true, data: undefined };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to delete class' };
  }
}

export async function regenerateInviteCode(
  classId: string,
  expiresInHours: InviteExpirationHours = 24 * 7,
): Promise<ActionResult<{ invite_code: string; invite_code_expires_at: string | null }>> {
  try {
    const { supabase } = await requireAuthUserId();
    const { data, error } = await supabase.rpc('regenerate_class_invite_code', {
      p_class_id: classId,
      p_expires_in_hours: expiresInHours,
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    revalidatePath(`/teacher/classes/${classId}`);
    return {
      ok: true,
      data: {
        invite_code: row.invite_code,
        invite_code_expires_at: row.invite_code_expires_at ?? null,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to regenerate code' };
  }
}

export async function setInviteCodeDisabled(classId: string, disabled: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await requireAuthUserId();
    const { error } = await supabase.from('classes').update({ invite_code_disabled: disabled }).eq('id', classId);
    if (error) throw error;
    revalidatePath(`/teacher/classes/${classId}`);
    return { ok: true, data: undefined };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to toggle invite code' };
  }
}