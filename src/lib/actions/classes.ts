'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  type ActionResult,
  type ClassRow,
  type CreateClassInput,
  pickClassColor,
} from '@/types/class';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AuthSuccess = { ok: true; userId: string; supabase: SupabaseClient };
type AuthFailure = { ok: false; error: string };
type AuthResult = AuthSuccess | AuthFailure;

async function requireUserWithClient(): Promise<AuthResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    console.log('[requireUser] Auth failed:', error);
    return { ok: false, error: 'Not authenticated.' };
  }
  console.log('[requireUser] Authenticated as:', data.user.id, data.user.email);
  return { ok: true, userId: data.user.id, supabase };
}

// ---------------------------------------------------------------------------
// Read actions
// ---------------------------------------------------------------------------

export async function listMyClasses(
  includeArchived = false,
): Promise<ActionResult<ClassRow[]>> {
  const auth = await requireUserWithClient();
  if (!auth.ok) return auth;

  let query = auth.supabase
    .from('classes')
    .select('*')
    .eq('teacher_id', auth.userId)
    .order('created_at', { ascending: false });

  if (!includeArchived) {
    query = query.eq('is_archived', false);
  }

  const { data, error } = await query;
  console.log('[listMyClasses] Found', data?.length ?? 0, 'classes for user', auth.userId);
  if (error) {
    console.log('[listMyClasses] Error:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, data: data as ClassRow[] };
}

export async function getClassById(
  classId: string,
): Promise<ActionResult<ClassRow>> {
  const auth = await requireUserWithClient();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase
    .from('classes')
    .select('*')
    .eq('id', classId)
    .single();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Class not found.' };
  return { ok: true, data: data as ClassRow };
}

export async function listMySectionSuggestions(): Promise<ActionResult<string[]>> {
  const auth = await requireUserWithClient();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase
    .from('classes')
    .select('section')
    .eq('teacher_id', auth.userId)
    .not('section', 'is', null);

  if (error) return { ok: false, error: error.message };

  const unique = Array.from(
    new Set(
      (data ?? [])
        .map((row) => (row as { section: string | null }).section)
        .filter((s): s is string => !!s && s.trim().length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return { ok: true, data: unique };
}

// ---------------------------------------------------------------------------
// Write actions
// ---------------------------------------------------------------------------

export async function createClass(
  input: CreateClassInput,
): Promise<ActionResult<ClassRow>> {
  console.log('[createClass] CALLED with input:', JSON.stringify(input));

  const auth = await requireUserWithClient();
  if (!auth.ok) {
    console.log('[createClass] Aborting - not authenticated');
    return auth;
  }

  const name = input.name?.trim();
  const semester = input.semester?.trim();
  if (!name) return { ok: false, error: 'Class name is required.' };
  if (!semester) return { ok: false, error: 'Semester is required.' };
  if (name.length > 200) {
    return { ok: false, error: 'Class name must be 200 characters or fewer.' };
  }

  console.log('[createClass] Inserting as user:', auth.userId);

  const { data, error } = await auth.supabase
    .from('classes')
    .insert({
      teacher_id: auth.userId,
      name,
      semester,
      section: input.section?.trim() || null,
      subject_code: input.subject_code?.trim() || null,
      description: input.description?.trim() || null,
      color: pickClassColor(name + Date.now().toString()),
    })
    .select('*')
    .single();

  console.log('[createClass] DB returned error:', JSON.stringify(error, null, 2));
  console.log('[createClass] DB returned data:', JSON.stringify(data, null, 2));

  if (error) return { ok: false, error: error.message };

  revalidatePath('/teacher/classes');
  revalidatePath('/teacher/dashboard');
  return { ok: true, data: data as ClassRow };
}

export async function setClassArchived(
  classId: string,
  archived: boolean,
): Promise<ActionResult<ClassRow>> {
  const auth = await requireUserWithClient();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase
    .from('classes')
    .update({ is_archived: archived })
    .eq('id', classId)
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath('/teacher/classes');
  revalidatePath('/teacher/dashboard');
  revalidatePath(`/teacher/classes/${classId}`);
  return { ok: true, data: data as ClassRow };
}

export async function regenerateInviteCode(
  classId: string,
): Promise<ActionResult<ClassRow>> {
  const auth = await requireUserWithClient();
  if (!auth.ok) return auth;

  const { data: codeData, error: codeError } = await auth.supabase.rpc(
    'generate_invite_code',
  );
  if (codeError) return { ok: false, error: codeError.message };
  if (!codeData || typeof codeData !== 'string') {
    return { ok: false, error: 'Invite code generator returned no value.' };
  }

  const { data, error } = await auth.supabase
    .from('classes')
    .update({ invite_code: codeData })
    .eq('id', classId)
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath('/teacher/classes');
  revalidatePath(`/teacher/classes/${classId}`);
  return { ok: true, data: data as ClassRow };
}