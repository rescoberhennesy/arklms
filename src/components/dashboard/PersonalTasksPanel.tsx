
// src/components/dashboard/PersonalTasksPanel.tsx
//
// Personal-tasks subsection used inside both StudentTodoWidget and
// TeacherTodoWidget. Renders:
//   - A filter toggle: Active (default) / Completed.
//   - An "Add task" toggle (Active view only) that expands to a title +
//     optional date + optional notes form.
//   - The task list. Each row is expandable to show full notes and
//     edit/delete actions.
//
// Active rows show:
//   - Checkbox to mark done (optimistic; rollback on failure).
//   - Pencil to edit title / due_at / notes inline.
//   - X to hard-delete.
//
// Completed rows show:
//   - "Restore" button (clears completed_at) and "Delete forever" (X).
//
// The Completed view fetches on-demand from listMyCompletedPersonalTasks
// when the user clicks the Completed pill — the parent widgets only
// pass active items, so we don't eager-load completed tasks for every
// dashboard render.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Check,
  X,
  Loader2,
  StickyNote,
  Calendar as CalendarIcon,
  Pencil,
  Undo2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  createPersonalTask,
  updatePersonalTask,
  markPersonalTaskDone,
  markPersonalTaskUndone,
  deletePersonalTask,
  listMyCompletedPersonalTasks,
} from '@/lib/actions/personalTasks';
import type { PersonalTaskItem } from '@/lib/types/dashboard';

interface PersonalTasksPanelProps {
  items: PersonalTaskItem[];
}

type FilterMode = 'active' | 'completed';

function formatTaskDue(dueAt: string, isOverdue: boolean): string {
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  const diff = Math.abs(due - now);
  const mins = Math.round(diff / 60_000);
  const hrs = Math.round(diff / 3_600_000);
  const days = Math.round(diff / 86_400_000);

  let magnitude: string;
  if (mins < 60) magnitude = `${mins}m`;
  else if (hrs < 24) magnitude = `${hrs}h`;
  else magnitude = `${days}d`;

  return isOverdue ? `overdue by ${magnitude}` : `due in ${magnitude}`;
}

function formatCompletedAt(completedAt: string): string {
  const c = new Date(completedAt).getTime();
  const diff = Date.now() - c;
  const mins = Math.round(diff / 60_000);
  const hrs = Math.round(diff / 3_600_000);
  const days = Math.round(diff / 86_400_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(completedAt).toLocaleDateString();
}

// Convert an ISO timestamp to the value format expected by
// <input type="datetime-local"> in the user's local timezone.
// Example: '2026-05-14T17:30' (no seconds, no Z).
function isoToLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${y}-${m}-${day}T${h}:${min}`;
}

export default function PersonalTasksPanel({ items }: PersonalTasksPanelProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterMode>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dueLocal, setDueLocal] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmitting] = useTransition();

  // Optimistically hidden task IDs (after mark-done / delete / restore).
  // Server revalidation refreshes the parent's `items`; meanwhile we
  // hide locally.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  // Completed-view state. Fetched on-demand the first time the user
  // opens the Completed view, and refetched after restore/delete actions
  // on completed rows (since router.refresh() only re-renders the
  // server-fetched `items` — the active list).
  const [completedItems, setCompletedItems] = useState<PersonalTaskItem[] | null>(
    null,
  );
  const [completedLoading, setCompletedLoading] = useState(false);
  const [completedError, setCompletedError] = useState<string | null>(null);

  async function loadCompleted() {
    setCompletedLoading(true);
    setCompletedError(null);
    try {
      const rows = await listMyCompletedPersonalTasks(50);
      setCompletedItems(rows);
    } catch (e) {
      setCompletedError(
        e instanceof Error ? e.message : 'Failed to load completed tasks.',
      );
    } finally {
      setCompletedLoading(false);
    }
  }

  function switchFilter(next: FilterMode) {
    if (next === filter) return;
    setFilter(next);
    setError(null);
    if (next === 'completed' && completedItems === null) {
      void loadCompleted();
    }
  }

  const activeVisible = items.filter((t) => !hiddenIds.has(t.id));
  const completedVisible =
    completedItems?.filter((t) => !hiddenIds.has(t.id)) ?? null;

  function resetForm() {
    setTitle('');
    setDueLocal('');
    setNotes('');
    setError(null);
  }

  function handleSubmit() {
    setError(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Title is required.');
      return;
    }

    startSubmitting(async () => {
      try {
        await createPersonalTask({
          title: trimmed,
          notes: notes.trim() || null,
          dueAt: dueLocal ? new Date(dueLocal).toISOString() : null,
        });
        resetForm();
        setFormOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to add task.');
      }
    });
  }

  function handleMarkDone(taskId: string) {
    setHiddenIds((prev) => new Set(prev).add(taskId));
    startSubmitting(async () => {
      try {
        await markPersonalTaskDone(taskId);
        // Invalidate completed cache so reopening the view fetches fresh.
        setCompletedItems(null);
        router.refresh();
      } catch (e) {
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        setError(e instanceof Error ? e.message : 'Failed to mark done.');
      }
    });
  }

  function handleRestore(taskId: string) {
    setHiddenIds((prev) => new Set(prev).add(taskId));
    startSubmitting(async () => {
      try {
        await markPersonalTaskUndone(taskId);
        // Refetch completed list so the restored row really disappears.
        await loadCompleted();
        router.refresh();
        // Clear the optimistic-hide for this id after the real list
        // arrives, otherwise if the user toggles back to Completed it
        // would still be hidden in the next session.
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      } catch (e) {
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        setError(e instanceof Error ? e.message : 'Failed to restore task.');
      }
    });
  }

  function handleDelete(taskId: string) {
    setHiddenIds((prev) => new Set(prev).add(taskId));
    startSubmitting(async () => {
      try {
        await deletePersonalTask(taskId);
        // If we deleted from the completed view, drop it from the
        // cached completed list too.
        setCompletedItems((prev) =>
          prev ? prev.filter((t) => t.id !== taskId) : prev,
        );
        router.refresh();
      } catch (e) {
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        setError(e instanceof Error ? e.message : 'Failed to delete task.');
      }
    });
  }

  async function handleSaveEdit(
    taskId: string,
    patch: { title: string; dueAt: string | null; notes: string | null },
  ): Promise<void> {
    // Run inside the same transition as other mutations so the busy
    // state is consistent across rows.
    await new Promise<void>((resolve, reject) => {
      startSubmitting(async () => {
        try {
          await updatePersonalTask(taskId, patch);
          router.refresh();
          resolve();
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed to save changes.';
          setError(msg);
          reject(e instanceof Error ? e : new Error(msg));
        }
      });
    });
  }

  const showActive = filter === 'active';

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          My tasks{' '}
          {showActive && activeVisible.length > 0 && `· ${activeVisible.length}`}
        </p>
        {showActive && !formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-1 rounded text-[11px] font-semibold text-red-600 hover:text-red-700"
          >
            <Plus className="h-3 w-3" />
            Add task
          </button>
        )}
      </div>

      {/* Filter pills */}
      <div className="mb-2 inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
        <button
          type="button"
          onClick={() => switchFilter('active')}
          className={`rounded px-2 py-0.5 font-semibold transition ${
            showActive
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Active
        </button>
        <button
          type="button"
          onClick={() => switchFilter('completed')}
          className={`rounded px-2 py-0.5 font-semibold transition ${
            !showActive
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Completed
        </button>
      </div>

      {showActive && formOpen && (
        <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            disabled={submitting}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
              if (e.key === 'Escape') {
                resetForm();
                setFormOpen(false);
              }
            }}
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          />

          <div className="mt-1.5 flex gap-1.5">
            <input
              type="datetime-local"
              value={dueLocal}
              onChange={(e) => setDueLocal(e.target.value)}
              disabled={submitting}
              className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
              placeholder="Due date (optional)"
            />
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            disabled={submitting}
            className="mt-1.5 w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          />

          {error && (
            <p className="mt-1.5 text-[11px] text-red-700">{error}</p>
          )}

          <div className="mt-2 flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setFormOpen(false);
              }}
              disabled={submitting}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !title.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
              Add
            </button>
          </div>
        </div>
      )}

      {/* Top-level error banner (mutation errors that don't belong to an
          open form or edit row). */}
      {error && !formOpen && (
        <p className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
          {error}
        </p>
      )}

      {/* ACTIVE VIEW */}
      {showActive && (
        <>
          {activeVisible.length === 0 && !formOpen && (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2.5 py-3 text-center text-xs italic text-slate-500">
              No personal tasks. Click &ldquo;Add task&rdquo; to create one.
            </p>
          )}

          {activeVisible.length > 0 && (
            <ul className="flex flex-col gap-1">
              {activeVisible.map((task) => (
                <ActiveTaskRow
                  key={task.id}
                  task={task}
                  busy={submitting}
                  onMarkDone={() => handleMarkDone(task.id)}
                  onDelete={() => handleDelete(task.id)}
                  onSaveEdit={(patch) => handleSaveEdit(task.id, patch)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {/* COMPLETED VIEW */}
      {!showActive && (
        <>
          {completedLoading && completedItems === null && (
            <p className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2.5 py-3 text-xs italic text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading completed tasks…
            </p>
          )}

          {completedError && (
            <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
              {completedError}
            </p>
          )}

          {completedVisible !== null && completedVisible.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2.5 py-3 text-center text-xs italic text-slate-500">
              No completed tasks yet.
            </p>
          )}

          {completedVisible !== null && completedVisible.length > 0 && (
            <ul className="flex flex-col gap-1">
              {completedVisible.map((task) => (
                <CompletedTaskRow
                  key={task.id}
                  task={task}
                  busy={submitting}
                  onRestore={() => handleRestore(task.id)}
                  onDelete={() => handleDelete(task.id)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// ACTIVE ROW — expandable with inline edit form
// --------------------------------------------------------------------------

interface ActiveTaskRowProps {
  task: PersonalTaskItem;
  busy: boolean;
  onMarkDone: () => void;
  onDelete: () => void;
  onSaveEdit: (patch: {
    title: string;
    dueAt: string | null;
    notes: string | null;
  }) => Promise<void>;
}

function ActiveTaskRow({
  task,
  busy,
  onMarkDone,
  onDelete,
  onSaveEdit,
}: ActiveTaskRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  // Local edit-form state. Initialized from the task whenever we enter
  // edit mode (not whenever the task prop changes — that would clobber
  // in-progress edits if the parent revalidated).
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDueLocal, setEditDueLocal] = useState(isoToLocalInputValue(task.dueAt));
  const [editNotes, setEditNotes] = useState(task.notes ?? '');
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setEditTitle(task.title);
    setEditDueLocal(isoToLocalInputValue(task.dueAt));
    setEditNotes(task.notes ?? '');
    setEditError(null);
    setEditing(true);
    setExpanded(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditError(null);
  }

  async function saveEdit() {
    setEditError(null);
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      setEditError('Title is required.');
      return;
    }
    setSaving(true);
    try {
      await onSaveEdit({
        title: trimmedTitle,
        dueAt: editDueLocal ? new Date(editDueLocal).toISOString() : null,
        notes: editNotes.trim() || null,
      });
      setEditing(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  const hasExpandableContent = task.notes !== null && task.notes.trim().length > 0;
  const rowBusy = busy || saving;

  return (
    <li className="group rounded-lg border border-slate-200 bg-white transition hover:border-slate-300 hover:bg-slate-50/50">
      <div className="flex items-start gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={onMarkDone}
          disabled={rowBusy}
          aria-label="Mark done"
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-transparent transition hover:border-red-500 hover:text-red-600 disabled:opacity-50"
        >
          <Check className="h-3 w-3" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-800">{task.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
            {task.dueAt ? (
              <span
                className={`inline-flex items-center gap-0.5 ${
                  task.isOverdue ? 'font-medium text-red-600' : ''
                }`}
              >
                <CalendarIcon className="h-2.5 w-2.5" />
                {formatTaskDue(task.dueAt, task.isOverdue === true)}
              </span>
            ) : (
              <span className="text-slate-400">No date</span>
            )}
            {task.notes && (
              <span className="inline-flex items-center gap-0.5 text-slate-500">
                <StickyNote className="h-2.5 w-2.5" />
                <span>Has notes</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          {(hasExpandableContent || editing) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              disabled={rowBusy}
              aria-label={expanded ? 'Collapse' : 'Expand'}
              title={expanded ? 'Collapse' : 'Expand'}
              className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
            >
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={editing ? cancelEdit : startEdit}
            disabled={rowBusy}
            aria-label={editing ? 'Cancel edit' : 'Edit task'}
            title={editing ? 'Cancel edit' : 'Edit task'}
            className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={rowBusy}
            aria-label="Delete task"
            title="Delete task"
            className="rounded p-0.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded body — full notes (read-only) OR edit form */}
      {expanded && !editing && hasExpandableContent && (
        <div className="border-t border-slate-100 px-2.5 py-2">
          <p className="whitespace-pre-wrap text-xs text-slate-600">
            {task.notes}
          </p>
        </div>
      )}

      {editing && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-2.5 py-2">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Task title"
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelEdit();
            }}
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          />
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              type="datetime-local"
              value={editDueLocal}
              onChange={(e) => setEditDueLocal(e.target.value)}
              disabled={saving}
              className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
            />
            {editDueLocal && (
              <button
                type="button"
                onClick={() => setEditDueLocal('')}
                disabled={saving}
                className="rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                title="Clear due date"
              >
                Clear
              </button>
            )}
          </div>
          <textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={3}
            disabled={saving}
            className="mt-1.5 w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          />
          {editError && (
            <p className="mt-1.5 text-[11px] text-red-700">{editError}</p>
          )}
          <div className="mt-2 flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={saving || !editTitle.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// --------------------------------------------------------------------------
// COMPLETED ROW — restore + hard-delete only, full notes visible
// --------------------------------------------------------------------------

interface CompletedTaskRowProps {
  task: PersonalTaskItem;
  busy: boolean;
  onRestore: () => void;
  onDelete: () => void;
}

function CompletedTaskRow({ task, busy, onRestore, onDelete }: CompletedTaskRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasNotes = task.notes !== null && task.notes.trim().length > 0;

  return (
    <li className="group rounded-lg border border-slate-200 bg-slate-50/40 transition hover:border-slate-300">
      <div className="flex items-start gap-2 px-2.5 py-2">
        <div
          aria-hidden
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-emerald-300 bg-emerald-50 text-emerald-600"
        >
          <Check className="h-3 w-3" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-500 line-through">
            {task.title}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
            {task.completedAt && (
              <span className="inline-flex items-center gap-0.5">
                <Check className="h-2.5 w-2.5" />
                completed {formatCompletedAt(task.completedAt)}
              </span>
            )}
            {hasNotes && (
              <span className="inline-flex items-center gap-0.5">
                <StickyNote className="h-2.5 w-2.5" />
                Has notes
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          {hasNotes && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              disabled={busy}
              aria-label={expanded ? 'Collapse' : 'Expand'}
              title={expanded ? 'Collapse' : 'Expand'}
              className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
            >
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onRestore}
            disabled={busy}
            aria-label="Restore task"
            title="Restore to active"
            className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600 disabled:opacity-30"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            aria-label="Delete forever"
            title="Delete forever"
            className="rounded p-0.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded && hasNotes && (
        <div className="border-t border-slate-100 px-2.5 py-2">
          <p className="whitespace-pre-wrap text-xs text-slate-500">
            {task.notes}
          </p>
        </div>
      )}
    </li>
  );
}
