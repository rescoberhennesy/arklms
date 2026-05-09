'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, X } from 'lucide-react';
import { createActivity } from '@/lib/actions/activities';
import {
  type ActivityWithAllSubmissions,
  type SubmissionType,
  SUBMISSION_TYPES,
  SUBMISSION_TYPE_LABELS,
} from '@/lib/types/activities';
import {
  type ModuleTerm,
  MODULE_TERMS,
  MODULE_TERM_LABELS,
} from '@/lib/types/modules';

interface AddActivityBarProps {
  classId: string;
  onOptimisticAdd: (activity: ActivityWithAllSubmissions) => void;
  onError: (msg: string | null) => void;
}

function defaultDueLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(23, 59, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string): string {
  return new Date(local).toISOString();
}

export default function AddActivityBar({
  classId,
  onOptimisticAdd,
  onError,
}: AddActivityBarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState('');
  const [term, setTerm] = useState<ModuleTerm>('prelim');
  const [maxPoints, setMaxPoints] = useState('100');
  const [dueLocal, setDueLocal] = useState(defaultDueLocal());
  const [submissionType, setSubmissionType] =
    useState<SubmissionType>('text');
  const [allowLate, setAllowLate] = useState(false);
  const [allowResubmission, setAllowResubmission] = useState(false);

  function reset() {
    setTitle('');
    setTerm('prelim');
    setMaxPoints('100');
    setDueLocal(defaultDueLocal());
    setSubmissionType('text');
    setAllowLate(false);
    setAllowResubmission(false);
  }

  function handleClose() {
    if (isPending) return;
    reset();
    setOpen(false);
  }

  function handleSubmit() {
    onError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      onError('Title is required.');
      return;
    }
    const points = Number(maxPoints);
    if (!Number.isFinite(points) || points <= 0) {
      onError('Max points must be a positive number.');
      return;
    }
    if (!dueLocal) {
      onError('Due date is required.');
      return;
    }

    const dueAtIso = localToIso(dueLocal);
    if (new Date(dueAtIso).getTime() <= Date.now()) {
      onError('Due date must be in the future.');
      return;
    }

    startTransition(async () => {
      try {
        const { activityId } = await createActivity({
          classId,
          term,
          title: trimmedTitle,
          maxPoints: points,
          dueAt: dueAtIso,
          submissionType,
          allowLate,
          allowResubmission,
        });

        onOptimisticAdd({
          id: activityId,
          classId,
          term,
          activityKind: 'assignment',
          title: trimmedTitle,
          description: '',
          maxPoints: points,
          startAt: new Date().toISOString(),
          dueAt: dueAtIso,
          allowLate,
          allowResubmission,
          submissionType,
          published: false,
          displayOrder: Number.MAX_SAFE_INTEGER,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          submissions: [],
        });

        reset();
        setOpen(false);
        router.refresh();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to create activity.');
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
      >
        <Plus className="h-4 w-4" />
        Add activity
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">New activity</h3>
        <button
          type="button"
          onClick={handleClose}
          disabled={isPending}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Essay on plate tectonics"
            disabled={isPending}
            autoFocus
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Term
          </label>
          <select
            value={term}
            onChange={(e) => setTerm(e.target.value as ModuleTerm)}
            disabled={isPending}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          >
            {MODULE_TERMS.map((t) => (
              <option key={t} value={t}>
                {MODULE_TERM_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Max points
          </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={maxPoints}
            onChange={(e) => setMaxPoints(e.target.value)}
            disabled={isPending}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Due date
          </label>
          <input
            type="datetime-local"
            value={dueLocal}
            onChange={(e) => setDueLocal(e.target.value)}
            disabled={isPending}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Submission type
          </label>
          <select
            value={submissionType}
            onChange={(e) =>
              setSubmissionType(e.target.value as SubmissionType)
            }
            disabled={isPending}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          >
            {SUBMISSION_TYPES.map((s) => (
              <option key={s} value={s}>
                {SUBMISSION_TYPE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2 flex flex-wrap gap-4 pt-1">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={allowLate}
              onChange={(e) => setAllowLate(e.target.checked)}
              disabled={isPending}
              className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            Allow late submissions
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={allowResubmission}
              onChange={(e) => setAllowResubmission(e.target.checked)}
              disabled={isPending}
              className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            Allow resubmission after grading
          </label>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleClose}
          disabled={isPending}
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Create activity (as draft)
        </button>
      </div>

      <p className="mt-2 text-xs text-gray-500">
        Created activities start as drafts. Open the activity to publish it
        and add a description.
      </p>
    </div>
  );
}