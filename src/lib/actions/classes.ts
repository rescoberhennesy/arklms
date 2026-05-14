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

  // TEMP DIAGNOSTIC — remove after
    const { data: uidInInsert } = await supabase.rpc('whoami_uid');
    console.log('[createClass] auth.uid() right before insert:', uidInInsert);

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
      .order('display_order', { ascending: true });

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

    const { data: minRow } = await supabase
      .from('classes')
      .select('display_order')
      .eq('teacher_id', userId)
      .order('display_order', { ascending: true })
      .limit(1)
      .maybeSingle();
    const newOrder = minRow ? (minRow.display_order as number) - 1 : 0;

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
        display_order: newOrder,
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
// --------------------------------------------------------------------------
// Cover photo
// --------------------------------------------------------------------------

/**
 * Persist a new cover_photo_url on a class, or clear it.
 * The actual upload to Supabase Storage happens client-side (the bucket's
 * RLS policies gate it). This action just records the resulting public URL.
 *
 * Pass `null` to remove the cover; the storage object is also deleted so we
 * don't leak orphans. Pass a URL to set/replace.
 *
 * Note: when *replacing* a cover, the client overwrites the same storage path
 * (`<class_id>/cover.<ext>`) with `upsert: true`, so no orphan cleanup is
 * needed in the replace case. Only the explicit-remove path deletes the file.
 */
export async function setClassCoverUrl(
  classId: string,
  url: string | null,
): Promise<ActionResult<{ cover_photo_url: string | null }>> {
  try {
    const { supabase } = await requireAuthUserId();

    // If clearing, also delete the storage object(s) for this class.
    // We list the folder and remove whatever's there -- this handles the
    // case where the extension might have changed across uploads.
    if (url === null) {
      const { data: list, error: listErr } = await supabase
        .storage
        .from('class-covers')
        .list(classId);

      if (listErr) {
        return { ok: false, error: listErr.message };
      }

      if (list && list.length > 0) {
        const paths = list.map((f) => `${classId}/${f.name}`);
        const { error: rmErr } = await supabase
          .storage
          .from('class-covers')
          .remove(paths);
        if (rmErr) {
          return { ok: false, error: rmErr.message };
        }
      }
    }

    const { data, error } = await supabase
      .from('classes')
      .update({ cover_photo_url: url })
      .eq('id', classId)
      .select('cover_photo_url')
      .single();

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath('/teacher/classes');
    revalidatePath(`/teacher/classes/${classId}`);
    revalidatePath('/teacher/dashboard');

    return {
      ok: true,
      data: { cover_photo_url: data.cover_photo_url as string | null },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to update cover photo';
    return { ok: false, error: msg };
  }
}


export async function reorderMyClasses(orderedIds: string[]): Promise<ActionResult> {
  try {
    const { supabase } = await requireAuthUserId();
    const { error } = await supabase.rpc('reorder_my_classes', {
      p_class_ids: orderedIds,
    });
    if (error) throw error;
    revalidatePath('/teacher/classes');
    revalidatePath('/teacher/dashboard');
    return { ok: true, data: undefined };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to reorder classes';
    return { ok: false, error: msg };
  }
}
