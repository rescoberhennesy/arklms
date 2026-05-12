'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type {
  PersonalTaskItem,
  CalendarPersonalTask,
} from '@/lib/types/dashboard';

// Trim + length-guard shared across writes.
function normalizeTitle(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Title is required.');
  if (trimmed.length > 200) throw new Error('Title is too long (max 200 chars).');
  return trimmed;
}

function normalizeNotes(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2000) throw new Error('Notes too long (max 2000 chars).');
  return trimmed;
}

// All routes that show personal-task counts should re-render after a
// mutation. Dashboards for both roles surface tasks; calendar pages do
// too (once we wire personal tasks into the calendar fetch — done in
// 5C).
function revalidateAllSurfaces() {
  revalidatePath('/teacher/dashboard');
  revalidatePath('/student/dashboard');
  revalidatePath('/teacher/calendar');
  revalidatePath('/student/calendar');
}

// --------------------------------------------------------------------------
// READS
// --------------------------------------------------------------------------

// Active tasks (completed_at IS NULL) for the current user.
// Ordered: overdue first (oldest-due first within), then upcoming
// (soonest-due first), then undated (most-recently-created first).
//
// `limit` is the to-do widget cap. Calendar reads use the separate
// listPersonalTasksInWindow call which has different semantics.
export async function listMyActivePersonalTasks(
  limit: number = 10,
): Promise<PersonalTaskItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('personal_tasks')
    .select('id, title, notes, due_at, created_at')
    .eq('owner_id', user.id)
    .is('completed_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load tasks: ${error.message}`);

  const now = Date.now();
  type Row = {
    id: string;
    title: string;
    notes: string | null;
    due_at: string | null;
    created_at: string;
  };
  const rows = (data ?? []) as Row[];

  const items: PersonalTaskItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    dueAt: r.due_at,
    isOverdue: r.due_at ? new Date(r.due_at).getTime() < now : null,
    createdAt: r.created_at,
  }));

  // Sort: overdue first (oldest-due first), then dated upcoming
  // (soonest-due first), then undated (most-recently-created first).
  items.sort((x, y) => {
    const xOver = x.isOverdue === true;
    const yOver = y.isOverdue === true;
    if (xOver !== yOver) return xOver ? -1 : 1;

    const xHas = x.dueAt !== null;
    const yHas = y.dueAt !== null;
    if (xHas !== yHas) return xHas ? -1 : 1;

    if (xHas && yHas) {
      // Both dated. Within overdue, oldest first; within upcoming,
      // soonest first. Same direction in both cases (asc by due_at).
      return new Date(x.dueAt!).getTime() - new Date(y.dueAt!).getTime();
    }

    // Both undated: newest first by created_at.
    return new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime();
  });

  return items.slice(0, limit);
}

// Active dated tasks for the current user falling within [windowStart,
// windowEnd). Used by the calendar to render gray task dots alongside
// class-color activity dots. Undated tasks are excluded (calendar can't
// place them).
export async function listMyPersonalTasksInWindow(
  windowStart: string,
  windowEnd: string,
): Promise<CalendarPersonalTask[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('personal_tasks')
    .select('id, title, due_at')
    .eq('owner_id', user.id)
    .is('completed_at', null)
    .not('due_at', 'is', null)
    .gte('due_at', windowStart)
    .lt('due_at', windowEnd)
    .order('due_at', { ascending: true });
  if (error) throw new Error(`Failed to load tasks: ${error.message}`);

  type Row = { id: string; title: string; due_at: string };
  return ((data ?? []) as Row[]).map((r) => ({
    taskId: r.id,
    title: r.title,
    dueAt: r.due_at,
  }));
}

// Active-task count for stat-card rollups. Cheap, RLS-filtered.
export async function countMyActivePersonalTasks(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { count, error } = await supabase
    .from('personal_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id)
    .is('completed_at', null);
  if (error) throw new Error(`Failed to count tasks: ${error.message}`);
  return count ?? 0;
}

// --------------------------------------------------------------------------
// WRITES
// --------------------------------------------------------------------------

export interface CreatePersonalTaskInput {
  title: string;
  notes?: string | null;
  dueAt?: string | null; // ISO or null
}

export async function createPersonalTask(
  input: CreatePersonalTaskInput,
): Promise<{ id: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const title = normalizeTitle(input.title);
  const notes = normalizeNotes(input.notes);
  // Allow due_at = null. If passed a non-null string, validate it parses
  // to a real date.
  let dueAt: string | null = null;
  if (input.dueAt != null && input.dueAt !== '') {
    const parsed = new Date(input.dueAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Invalid due date.');
    }
    dueAt = parsed.toISOString();
  }

  const { data, error } = await supabase
    .from('personal_tasks')
    .insert({
      owner_id: user.id,
      title,
      notes,
      due_at: dueAt,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create task: ${error.message}`);

  revalidateAllSurfaces();
  return { id: data.id as string };
}

// Mark a task done (soft-delete via completed_at). RLS ensures only
// the owner can update; we don't re-check ownership here.
export async function markPersonalTaskDone(taskId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('personal_tasks')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', taskId);
  if (error) throw new Error(`Failed to mark done: ${error.message}`);
  revalidateAllSurfaces();
}

// Undo a "mark done" — clear completed_at. Not exposed in v1 UI but
// kept here so a future "Completed" view can offer un-completion.
export async function markPersonalTaskUndone(taskId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('personal_tasks')
    .update({ completed_at: null })
    .eq('id', taskId);
  if (error) throw new Error(`Failed to undo: ${error.message}`);
  revalidateAllSurfaces();
}

// Hard-delete a task. Different from "mark done" — this removes the
// row from history entirely. Useful for fat-finger fixes.
export async function deletePersonalTask(taskId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('personal_tasks')
    .delete()
    .eq('id', taskId);
  if (error) throw new Error(`Failed to delete task: ${error.message}`);
  revalidateAllSurfaces();
}