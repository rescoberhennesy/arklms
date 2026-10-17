// src/components/teacher/AddActivityBar.tsx
'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2 } from 'lucide-react';
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
import Modal from '@/components/shared/Modal';

interface AddActivityBarProps {
  classId: string;
  onOptimisticAdd: (activity: ActivityWithAllSubmissions) => void;
  onError: (msg: string | null) => void;
  defaultOpen?: boolean;
  /** Term pre-selected when the form opens (e.g. the tab you're on). */
  defaultTerm?: ModuleTerm;
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

const inputClass =
  'w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60';

export default function AddActivityBar({
  classId,
  onOptimisticAdd,
  onError,
  defaultOpen = false,
  defaultTerm = 'prelim',
}: AddActivityBarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const [kind, setKind] = useState<ActivityKind>('assignment');
  const [title, setTitle] = useState('');
  const [term, setTerm] = useState<ModuleTerm>(defaultTerm);
  const [maxPoints, setMaxPoints] = useState('100');
  const [dueLocal, setDueLocal] = useState(defaultDueLocal());
  const [submissionType, setSubmissionType] =
    useState<SubmissionType>('text');
  const [allowLate, setAllowLate] = useState(false);

  // Bounded attempts. Default 1 = single submission.
  const [allowResubmission, setAllowResubmission] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState('3');

  const isQuiz = kind === 'quiz';

  // ?create=1 can flip defaultOpen after mount
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  function reset() {
    setKind('assignment');
    setTitle('');
    setTerm(defaultTerm);
    setMaxPoints('100');
    setDueLocal(defaultDueLocal());
    setSubmissionType('text');
    setAllowLate(false);
    setAllowResubmission(false);
    setMaxAttempts('3');
    setFormError(null);
  }

  function handleOpen() {
    reset();
    setOpen(true);
  }

  function handleClose() {
    if (isPending) return;
    reset();
    setOpen(false);
  }

  function handleSubmit() {
    setFormError(null);
    onError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError('Title is required.');
      return;
    }
    if (!dueLocal) {
      setFormError('Due date is required.');
      return;
    }
    const dueAtIso = localToIso(dueLocal);
    if (new Date(dueAtIso).getTime() <= Date.now()) {
      setFormError('Due date must be in the future.');
      return;
    }

    let points = 0;
    let attemptsToSend = 1;
    if (!isQuiz) {
      points = Number(maxPoints);
      if (!Number.isFinite(points) || points <= 0) {
        setFormError('Max points must be a positive number.');
        return;
      }
      if (allowResubmission) {
        const n = Number(maxAttempts);
        if (!Number.isInteger(n) || n < 2 || n > 10) {
          setFormError('Max attempts must be a whole number between 2 and 10.');
          return;
        }
        attemptsToSend = n;
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
        setFormError(e instanceof Error ? e.message : 'Failed to create activity.');
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
      >
        <Plus className="h-4 w-4" />
        Add activity
      </button>

      <Modal
        open={open}
        title={isQuiz ? 'New quiz' : 'New activity'}
        onClose={handleClose}
        busy={isPending}
        size="max-w-2xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="act-kind" className="mb-1 block text-xs font-medium text-gray-700">
                Kind
              </label>
              <select
                id="act-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as ActivityKind)}
                disabled={isPending}
                className={inputClass}
              >
                {ACTIVITY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ACTIVITY_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
              {isQuiz && (
                <p className="mt-1 text-xs text-gray-500">
                  Max points and submission settings are configured
                  per-question once you add questions.
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <label htmlFor="act-title" className="mb-1 block text-xs font-medium text-gray-700">
                Title <span className="text-red-600">*</span>
              </label>
              <input
                id="act-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  isQuiz ? 'e.g. Chapter 3 quiz' : 'e.g. Essay on plate tectonics'
                }
                disabled={isPending}
                autoFocus
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="act-term" className="mb-1 block text-xs font-medium text-gray-700">
                Term
              </label>
              <select
                id="act-term"
                value={term}
                onChange={(e) => setTerm(e.target.value as ModuleTerm)}
                disabled={isPending}
                className={inputClass}
              >
                {MODULE_TERMS.map((t) => (
                  <option key={t} value={t}>
                    {MODULE_TERM_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="act-due" className="mb-1 block text-xs font-medium text-gray-700">
                Due date
              </label>
              <input
                id="act-due"
                type="datetime-local"
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
                disabled={isPending}
                className={inputClass}
              />
            </div>

            {!isQuiz && (
              <>
                <div>
                  <label htmlFor="act-points" className="mb-1 block text-xs font-medium text-gray-700">
                    Max points
                  </label>
                  <input
                    id="act-points"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={maxPoints}
                    onChange={(e) => setMaxPoints(e.target.value)}
                    disabled={isPending}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="act-subtype" className="mb-1 block text-xs font-medium text-gray-700">
                    Submission type
                  </label>
                  <select
                    id="act-subtype"
                    value={submissionType}
                    onChange={(e) =>
                      setSubmissionType(e.target.value as SubmissionType)
                    }
                    disabled={isPending}
                    className={inputClass}
                  >
                    {SUBMISSION_TYPES.map((s) => (
                      <option key={s} value={s}>
                        {SUBMISSION_TYPE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 pt-1 md:col-span-2">
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
                    {allowResubmission ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                        <label htmlFor="act-attempts" className="text-sm text-gray-600">
                          Max attempts
                        </label>
                        <input
                          id="act-attempts"
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
                    ) : (
                      <p className="ml-6 text-xs text-gray-500">
                        Students get one attempt by default.
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            {isQuiz && (
              <div className="pt-1 md:col-span-2">
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
                  Students can start and submit after the due date. Late
                  attempts are flagged.
                </p>
              </div>
            )}
          </div>

          {formError && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          <p className="mt-4 text-xs text-gray-500">
            {isQuiz
              ? 'Quizzes start as drafts. Open the quiz to add questions and publish it.'
              : 'Activities start as drafts. Open the activity to publish it and add a description.'}
          </p>

          <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isQuiz ? 'Create quiz (as draft)' : 'Create activity (as draft)'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}