
// src/components/teacher/CopyFromClassModal.tsx
//
// Modal for "Copy from another class" flow on the activities tab.
// Three steps:
//   1) Pick a source class (loaded on open via listTeacherClassesForCopy).
//   2) Pick a source activity from that class (loaded when class chosen).
//   3) Pick a target term (defaults to the source activity's term).
//
// On confirm, calls duplicateActivity and navigates to the new activity's
// editor in the current (target) class.
//
// Note: this modal does NOT handle same-class inline duplicates — those
// go through a separate button on the activity card that calls
// duplicateActivity directly without the picker.

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2, Copy as CopyIcon, ChevronLeft } from 'lucide-react';
import {
  listTeacherClassesForCopy,
  listClassActivitiesForCopy,
  duplicateActivity,
  type TeacherClassForCopy,
  type ClassActivityForCopy,
} from '@/lib/actions/activities';
import {
  type ModuleTerm,
  MODULE_TERMS,
  MODULE_TERM_LABELS,
} from '@/lib/types/modules';
import { ACTIVITY_KIND_LABELS } from '@/lib/types/activities';

interface CopyFromClassModalProps {
  open: boolean;
  targetClassId: string;
  onClose: () => void;
  // Called after a successful copy with the new activity's id. The parent
  // typically refreshes its list and/or navigates to the editor.
  onCopied: (newActivityId: string) => void;
}

type Step = 'pick-class' | 'pick-activity' | 'pick-term';

export default function CopyFromClassModal({
  open,
  targetClassId,
  onClose,
  onCopied,
}: CopyFromClassModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('pick-class');

  // Source-class list state.
  const [classes, setClasses] = useState<TeacherClassForCopy[] | null>(null);
  const [classesLoading, setClassesLoading] = useState(false);
  const [classesError, setClassesError] = useState<string | null>(null);

  // Selected source class.
  const [selectedClass, setSelectedClass] = useState<TeacherClassForCopy | null>(
    null,
  );

  // Activities-in-source-class state.
  const [activities, setActivities] = useState<ClassActivityForCopy[] | null>(
    null,
  );
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);

  // Selected source activity.
  const [selectedActivity, setSelectedActivity] = useState<
    ClassActivityForCopy | null
  >(null);

  // Target term.
  const [targetTerm, setTargetTerm] = useState<ModuleTerm>('prelim');

  const [submitting, startSubmitting] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset and fetch class list when the modal opens.
  useEffect(() => {
    if (!open) return;
    setStep('pick-class');
    setSelectedClass(null);
    setActivities(null);
    setSelectedActivity(null);
    setSubmitError(null);
    setTargetTerm('prelim');

    let cancelled = false;
    async function load() {
      setClassesLoading(true);
      setClassesError(null);
      try {
        const rows = await listTeacherClassesForCopy();
        if (cancelled) return;
        // Exclude the current (target) class from the source picker
        // when there are other options. If the teacher only has one
        // class, keep it visible so they understand same-class copy
        // works through this modal too.
        const others = rows.filter((c) => c.classId !== targetClassId);
        setClasses(others.length > 0 ? others : rows);
      } catch (e) {
        if (cancelled) return;
        setClassesError(
          e instanceof Error ? e.message : 'Failed to load classes.',
        );
      } finally {
        if (!cancelled) setClassesLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, targetClassId]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  async function pickClass(c: TeacherClassForCopy) {
    setSelectedClass(c);
    setStep('pick-activity');
    setActivities(null);
    setActivitiesError(null);
    setActivitiesLoading(true);
    try {
      const rows = await listClassActivitiesForCopy(c.classId);
      setActivities(rows);
    } catch (e) {
      setActivitiesError(
        e instanceof Error ? e.message : 'Failed to load activities.',
      );
    } finally {
      setActivitiesLoading(false);
    }
  }

  function pickActivity(a: ClassActivityForCopy) {
    setSelectedActivity(a);
    setTargetTerm(a.term); // default the target term to the source's term
    setStep('pick-term');
  }

  function backToClasses() {
    if (submitting) return;
    setStep('pick-class');
    setSelectedClass(null);
    setActivities(null);
    setSelectedActivity(null);
    setSubmitError(null);
  }

  function backToActivities() {
    if (submitting) return;
    setStep('pick-activity');
    setSelectedActivity(null);
    setSubmitError(null);
  }

  function handleConfirm() {
    if (!selectedActivity) return;
    setSubmitError(null);
    startSubmitting(async () => {
      try {
        const { activityId } = await duplicateActivity({
          sourceActivityId: selectedActivity.activityId,
          targetClassId,
          targetTerm,
        });
        onCopied(activityId);
        router.refresh();
        onClose();
      } catch (e) {
        setSubmitError(
          e instanceof Error ? e.message : 'Failed to copy activity.',
        );
      }
    });
  }

  function handleBackdrop() {
    if (submitting) return;
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={handleBackdrop}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            {step !== 'pick-class' && (
              <button
                type="button"
                onClick={
                  step === 'pick-activity' ? backToClasses : backToActivities
                }
                disabled={submitting}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                aria-label="Back"
                title="Back"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-lg font-semibold text-gray-900">
              {step === 'pick-class' && 'Copy from another class'}
              {step === 'pick-activity' &&
                `Activities in ${selectedClass?.name ?? ''}`}
              {step === 'pick-term' && 'Choose target term'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Step 1: pick class */}
          {step === 'pick-class' && (
            <>
              {classesLoading && (
                <p className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading classes…
                </p>
              )}
              {classesError && (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {classesError}
                </p>
              )}
              {classes !== null && classes.length === 0 && !classesLoading && (
                <p className="py-6 text-center text-sm italic text-gray-500">
                  You don&apos;t teach any other classes to copy from.
                </p>
              )}
              {classes !== null && classes.length > 0 && (
                <ul className="space-y-1.5">
                  {classes.map((c) => (
                    <li key={c.classId}>
                      <button
                        type="button"
                        onClick={() => pickClass(c)}
                        className="flex w-full items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left transition hover:border-red-300 hover:bg-red-50/30"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {c.name}
                          </p>
                          {c.section && (
                            <p className="mt-0.5 truncate text-xs text-gray-500">
                              Section {c.section}
                            </p>
                          )}
                        </div>
                        {c.classId === targetClassId && (
                          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                            This class
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* Step 2: pick activity */}
          {step === 'pick-activity' && (
            <>
              {activitiesLoading && (
                <p className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading activities…
                </p>
              )}
              {activitiesError && (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {activitiesError}
                </p>
              )}
              {activities !== null &&
                activities.length === 0 &&
                !activitiesLoading && (
                  <p className="py-6 text-center text-sm italic text-gray-500">
                    This class has no activities to copy.
                  </p>
                )}
              {activities !== null && activities.length > 0 && (
                <ul className="space-y-1.5">
                  {activities.map((a) => (
                    <li key={a.activityId}>
                      <button
                        type="button"
                        onClick={() => pickActivity(a)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left transition hover:border-red-300 hover:bg-red-50/30"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {a.title}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                            <span>{ACTIVITY_KIND_LABELS[a.activityKind]}</span>
                            <span aria-hidden>·</span>
                            <span>{MODULE_TERM_LABELS[a.term]}</span>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* Step 3: pick target term */}
          {step === 'pick-term' && selectedActivity && (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Copying
                </p>
                <p className="mt-0.5 truncate text-sm font-medium text-gray-900">
                  {selectedActivity.title}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {ACTIVITY_KIND_LABELS[selectedActivity.activityKind]} from{' '}
                  {selectedClass?.name}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">
                  Target term in this class
                </label>
                <select
                  value={targetTerm}
                  onChange={(e) => setTargetTerm(e.target.value as ModuleTerm)}
                  disabled={submitting}
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
                >
                  {MODULE_TERMS.map((t) => (
                    <option key={t} value={t}>
                      {MODULE_TERM_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                The copy will start as a <strong>draft</strong> with a new due
                date 7 days from now. Quiz questions and attachments will be
                duplicated. Submissions and grades will not.
              </div>

              {submitError && (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {submitError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer (only on step 3) */}
        {step === 'pick-term' && (
          <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CopyIcon className="h-3.5 w-3.5" />
              )}
              {submitting ? 'Copying…' : 'Copy activity'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
