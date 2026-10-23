'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type IncomingTransfer = {
  requestId: string;
  classId: string;
  className: string;
  classSection: string | null;
  fromName: string;
  note: string | null;
  createdAt: string;
  studentCount: number;
};

export type PendingTransfer = {
  requestId: string;
  toName: string;
  toEmail: string;
  createdAt: string;
};

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function msg(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export async function requestClassTransfer(
  classId: string,
  email: string,
  note: string,
): Promise<Result> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('request_class_transfer', {
      p_class_id: classId,
      p_email: email.trim(),
      p_note: note.trim() || null,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/teacher/classes/${classId}/settings`);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: msg(e, 'Could not send the transfer request.') };
  }
}

export async function cancelClassTransfer(requestId: string, classId: string): Promise<Result> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('cancel_class_transfer', { p_request_id: requestId });
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/teacher/classes/${classId}/settings`);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: msg(e, 'Could not cancel the transfer.') };
  }
}

export async function respondClassTransfer(
  requestId: string,
  accept: boolean,
): Promise<Result<{ classId: string }>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('respond_class_transfer', {
      p_request_id: requestId,
      p_accept: accept,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath('/teacher/classes');
    return { ok: true, data: { classId: data as string } };
  } catch (e) {
    return { ok: false, error: msg(e, 'Could not respond to the transfer.') };
  }
}

export async function listIncomingTransfers(): Promise<IncomingTransfer[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('list_my_incoming_class_transfers');
    if (error) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((r) => ({
      requestId: r.request_id,
      classId: r.class_id,
      className: r.class_name,
      classSection: r.class_section,
      fromName: r.from_name,
      note: r.note,
      createdAt: r.created_at,
      studentCount: r.student_count ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function getPendingTransfer(classId: string): Promise<PendingTransfer | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('get_pending_class_transfer', { p_class_id: classId });
    if (error) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = ((data ?? []) as any[])[0];
    if (!r) return null;
    return { requestId: r.request_id, toName: r.to_name, toEmail: r.to_email, createdAt: r.created_at };
  } catch {
    return null;
  }
}