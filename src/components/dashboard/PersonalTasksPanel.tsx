// src/components/dashboard/PersonalTasksPanel.tsx
//
// Personal-tasks subsection used inside both StudentTodoWidget and
// TeacherTodoWidget. Renders:
//   - An "Add task" toggle that expands to a title + optional date +
//     optional notes form.
//   - The active personal-task list, with checkboxes to mark done.
//   - Inline delete (X icon) on hover for hard-delete.
//
// Done tasks disappear from the list (soft-deleted via completed_at).
// Optimistic UI: marking done removes the row immediately; rollback on
// server failure.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Check, X, Loader2, StickyNote, Calendar as CalendarIcon } from 'lucide-react';
import {
  createPersonalTask,
  markPersonalTaskDone,
  deletePersonalTask,
} from '@/lib/actions/personalTasks';
import type { PersonalTaskItem } from '@/lib/types/dashboard';

interface PersonalTasksPanelProps {
  items: PersonalTaskItem[];
}

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

export default function PersonalTasksPanel({ items }: PersonalTasksPanelProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dueLocal, setDueLocal] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmitting] = useTransition();

  // Optimistically hidden task IDs (after mark-done / delete click).
  // Server revalidation will refresh `items`; meanwhile we hide locally.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const visibleItems = items.filter((t) => !hiddenIds.has(t.id));

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
        router.refresh();
      } catch (e) {
        // Rollback on failure: unhide the row.
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        setError(e instanceof Error ? e.message : 'Failed to mark done.');
      }
    });
  }

  function handleDelete(taskId: string) {
    setHiddenIds((prev) => new Set(prev).add(taskId));
    startSubmitting(async () => {
      try {
        await deletePersonalTask(taskId);
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

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          My tasks {visibleItems.length > 0 && `· ${visibleItems.length}`}
        </p>
        {!formOpen && (
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

      {formOpen && (
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

      {visibleItems.length === 0 && !formOpen && (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2.5 py-3 text-center text-xs italic text-slate-500">
          No personal tasks. Click &ldquo;Add task&rdquo; to create one.
        </p>
      )}

      {visibleItems.length > 0 && (
        <ul className="flex flex-col gap-1">
          {visibleItems.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              busy={submitting}
              onMarkDone={() => handleMarkDone(task.id)}
              onDelete={() => handleDelete(task.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface TaskRowProps {
  task: PersonalTaskItem;
  busy: boolean;
  onMarkDone: () => void;
  onDelete: () => void;
}

function TaskRow({ task, busy, onMarkDone, onDelete }: TaskRowProps) {
  return (
    <li className="group flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 transition hover:border-slate-300 hover:bg-slate-50/50">
      <button
        type="button"
        onClick={onMarkDone}
        disabled={busy}
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
            <span className="inline-flex items-center gap-0.5" title={task.notes}>
              <StickyNote className="h-2.5 w-2.5" />
              <span className="max-w-[8rem] truncate">{task.notes}</span>
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        aria-label="Delete task"
        title="Delete task"
        className="shrink-0 rounded p-0.5 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:opacity-30"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}