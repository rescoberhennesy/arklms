// src/components/teacher/AddActivityBar.tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, X } from 'lucide-react';
import { createActivity } from '@/lib/actions/activities';
import { createQuizActivity } from '@/lib/actions/quizzes';
import {
  type ActivityKind,
  type ActivityWithAllSubmissions,
  type SubmissionType,
  ACTIVITY_KINDS,
  ACTIVITY_KIND_LABELS,
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
  defaultOpen?: boolean;
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
  defaultOpen = false,
}: AddActivityBarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [isPending, startTransition] = useTransition();

  const [kind, setKind] = useState<ActivityKind>('assignment');
  const [title, setTitle] = useState('');
  const [term, setTerm] = useState<ModuleTerm>('prelim');
  const [maxPoints, setMaxPoints] = useState('100');
  const [dueLocal, setDueLocal] = useState(defaultDueLocal());
  const [submissionType, setSubmissionType] =
    useState<SubmissionType>('text');
  const [allowLate, setAllowLate] = useState(false);

  // NEW: bounded attempts. Default 1 = single submission (current behavior).
  // Teacher checks "Allow resubmission" to bump it; the number field then
  // controls how many attempts are permitted.
  const [allowResubmission, setAllowResubmission] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState('3');

  const isQuiz = kind === 'quiz';

  function reset() {
    setKind('assignment');
    setTitle('');
    setTerm('prelim');
    setMaxPoints('100');
    setDueLocal(defaultDueLocal());
    setSubmissionType('text');
    setAllowLate(false);
    setAllowResubmission(false);
    setMaxAttempts('3');
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
    if (!dueLocal) {
      onError('Due date is required.');
      return;
    }
    const dueAtIso = localToIso(dueLocal);
    if (new Date(dueAtIso).getTime() <= Date.now()) {
      onError('Due date must be in the future.');
      return;
    }

    let points = 0;
    let attemptsToSend = 1;
    if (!isQuiz) {
      points = Number(maxPoints);
      if (!Number.isFinite(points) || points <= 0) {
        onError('Max points must be a positive number.');
        return;
      }

      if (allowResubmission) {
        const n = Number(maxAttempts);
        if (
          !Number.isInteger(n) ||
          n < 2 ||
          n > 10
        ) {
          onError('Max attempts must be a whole number between 2 and 10.');
          return;
        }
        attemptsToSend = n;
      } else {
        attemptsToSend = 1;
      }
    }

    startTransition(async () => {
      try {
        let activityId: string;
        let optimisticPoints: number;
        let optimisticSubmissionType: SubmissionType;
        let optimisticMaxAttempts: number;

        if (isQuiz) {
          const res = await createQuizActivity({
            classId,
            term,
            title: trimmedTitle,
            dueAt: dueAtIso,
            allowLate,
          });
          activityId = res.activityId;
          optimisticPoints = 0;
          optimisticSubmissionType = 'none';
          optimisticMaxAttempts = 1; // quizzes are single-attempt by design
        } else {
          const res = await createActivity({
            classId,
            term,
            title: trimmedTitle,
            maxPoints: points,
            dueAt: dueAtIso,
            submissionType,
            allowLate,
            maxAttempts: attemptsToSend,
          });
          activityId = res.activityId;
          optimisticPoints = points;
          optimisticSubmissionType = submissionType;
          optimisticMaxAttempts = attemptsToSend;
        }

        onOptimisticAdd({
          id: activityId,
          classId,
          term,
          activityKind: kind,
          title: trimmedTitle,
          instructions: '',
          prompt: '',
          maxPoints: optimisticPoints,
          startAt: new Date().toISOString(),
          dueAt: dueAtIso,
          allowLate,
          allowResubmission: false, // deprecated; never set true going forward
          maxAttempts: optimisticMaxAttempts,
          submissionType: optimisticSubmissionType,
          published: false,
          displayOrder: Number.MAX_SAFE_INTEGER,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          submissions: [],
        });

        reset();
        setOpen(false);
        router.push(`/teacher/classes/${classId}/activities/${activityId}`);
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
            Kind
          </label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ActivityKind)}
            disabled={isPending}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          >
            {ACTIVITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {ACTIVITY_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          {isQuiz && (
            <p className="mt-1 text-xs text-gray-500">
              Max points and submission settings are configured per-question
              once you add questions.
            </p>
          )}
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              isQuiz
                ? 'e.g. Chapter 3 quiz'
                : 'e.g. Essay on plate tectonics'
            }
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

        {!isQuiz && (
          <>
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

            <div className="md:col-span-2 space-y-2 pt-1">
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

              <div>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={allowResubmission}
                    onChange={(e) => setAllowResubmission(e.target.checked)}
                    disabled={isPending}
                    className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  Allow resubmission
                </label>
                {allowResubmission && (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-sm text-gray-600">
                      Max attempts
                    </label>
                    <input
                      type="number"
                      min="2"
                      max="10"
                      step="1"
                      value={maxAttempts}
                      onChange={(e) => setMaxAttempts(e.target.value)}
                      disabled={isPending}
                      className="w-20 rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
                    />
                    <span className="text-xs text-gray-500">
                      Students can submit up to this many times.
                    </span>
                  </div>
                )}
                {!allowResubmission && (
                  <p className="ml-6 text-xs text-gray-500">
                    Students get one attempt by default.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {isQuiz && (
          <div className="md:col-span-2 pt-1">
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
            <p className="ml-6 text-xs text-gray-500">
              Students can start and submit after the due date. Late attempts
              are flagged.
            </p>
          </div>
        )}
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
          {isQuiz ? 'Create quiz (as draft)' : 'Create activity (as draft)'}
        </button>
      </div>

      <p className="mt-2 text-xs text-gray-500">
        {isQuiz
          ? 'Created quizzes start as drafts. Open the quiz to add questions and publish it.'
          : 'Created activities start as drafts. Open the activity to publish it and add a description.'}
      </p>
    </div>
  );
}