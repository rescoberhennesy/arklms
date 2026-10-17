'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Pencil,
  Trash2,
  Save,
  Loader2,
  Eye,
  Sparkles,
  EyeOff,
  CheckCheck,
  Paperclip,
  Plus,
} from 'lucide-react';
import MarkdownEditor from '@/components/dashboard/MarkdownEditor';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import AIActivityPromptModal from '@/components/teacher/ai/AIActivityPromptModal';
import {
  updateActivity,
  setActivityTerm,
  setActivityPublished,
  deleteActivity,
  returnAllGrades,
} from '@/lib/actions/activities';
import {
  type ActivityWithAllSubmissions,
  type SubmissionWithGrade,
  type SubmissionType,
  type ActivityAttachment,
  SUBMISSION_TYPES,
  SUBMISSION_TYPE_LABELS,
} from '@/lib/types/activities';
import {
  type ModuleTerm,
  MODULE_TERMS,
  MODULE_TERM_LABELS,
} from '@/lib/types/modules';
import ActivityAttachmentsPanel from '@/components/teacher/ActivityAttachmentsPanel';

interface ActivityEditorProps {
  activity: ActivityWithAllSubmissions;
  classId: string;
  initialAttachments: ActivityAttachment[];
}

const TERM_ACCENTS: Record<ModuleTerm, string> = {
  prelim: 'border-blue-200 text-blue-800 bg-blue-50',
  midterm: 'border-purple-200 text-purple-800 bg-purple-50',
  prefinal: 'border-amber-200 text-amber-800 bg-amber-50',
  final: 'border-rose-200 text-rose-800 bg-rose-50',
};

function isoToLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string): string {
  return new Date(local).toISOString();
}

function activitySignature(a: ActivityWithAllSubmissions): string {
  return [
    a.id,
    a.title,
    a.term,
    a.instructions,
    a.prompt,
    String(a.maxPoints),
    a.startAt,
    a.dueAt,
    a.allowLate ? 1 : 0,
    String(a.maxAttempts),
    a.submissionType,
    a.published ? 1 : 0,
    a.submissions
      .map(
        (s) =>
          `${s.id}:${s.studentId}:${s.isLate ? 1 : 0}:${s.attemptNumber}:${
            s.grade
              ? `${s.grade.score}:${s.grade.returnedAt ?? ''}`
              : 'none'
          }`,
      )
      .join('|'),
  ].join('§');
}

export default function ActivityEditor({
  activity,
  classId,
  initialAttachments,
}: ActivityEditorProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(activity.title);

  // Instructions
  const [instructions, setInstructions] = useState(activity.instructions);
  const [savedInstructions, setSavedInstructions] = useState(activity.instructions);
  const [instructionsEditing, setInstructionsEditing] = useState(false);
  const isInstructionsDirty = instructions !== savedInstructions;

  // Prompt
  const [prompt, setPrompt] = useState(activity.prompt);
  const [savedPrompt, setSavedPrompt] = useState(activity.prompt);
  const [promptEditing, setPromptEditing] = useState(false);
  const isPromptDirty = prompt !== savedPrompt;

  // Settings
  const [maxPoints, setMaxPoints] = useState(String(activity.maxPoints));
  const [savedMaxPoints, setSavedMaxPoints] = useState(String(activity.maxPoints));
  const [startLocal, setStartLocal] = useState(isoToLocal(activity.startAt));
  const [savedStartLocal, setSavedStartLocal] = useState(isoToLocal(activity.startAt));
  const [dueLocal, setDueLocal] = useState(isoToLocal(activity.dueAt));
  const [savedDueLocal, setSavedDueLocal] = useState(isoToLocal(activity.dueAt));
  const [submissionType, setSubmissionType] = useState<SubmissionType>(activity.submissionType);
  const [savedSubmissionType, setSavedSubmissionType] = useState<SubmissionType>(activity.submissionType);
  const [allowLate, setAllowLate] = useState(activity.allowLate);
  const [savedAllowLate, setSavedAllowLate] = useState(activity.allowLate);

  // NEW: bounded attempts. allowResubmission is now a UI-only checkbox
  // that controls whether maxAttempts > 1 is allowed.
  const [allowResubmission, setAllowResubmission] = useState(activity.maxAttempts > 1);
  const [savedAllowResubmission, setSavedAllowResubmission] = useState(activity.maxAttempts > 1);
  const [maxAttempts, setMaxAttempts] = useState(
    String(activity.maxAttempts > 1 ? activity.maxAttempts : 3),
  );
  const [savedMaxAttempts, setSavedMaxAttempts] = useState(
    String(activity.maxAttempts > 1 ? activity.maxAttempts : 3),
  );

  const isSettingsDirty =
    maxPoints !== savedMaxPoints ||
    startLocal !== savedStartLocal ||
    dueLocal !== savedDueLocal ||
    submissionType !== savedSubmissionType ||
    allowLate !== savedAllowLate ||
    allowResubmission !== savedAllowResubmission ||
    (allowResubmission && maxAttempts !== savedMaxAttempts);

  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);

  function handleAiQuestions(markdown: string, mode: 'replace' | 'append') {
    setPrompt((current) =>
      mode === 'append' && current.trim() ? `${current.trim()}\n\n${markdown}` : markdown,
    );
    setPromptEditing(true); // show it in the editor; teacher saves when ready
  }

  const sig = activitySignature(activity);
  const lastSyncedSig = useRef(sig);
  const titleEditingRef = useRef(titleEditing);
  const instructionsEditingRef = useRef(instructionsEditing);
  const promptEditingRef = useRef(promptEditing);
  const isInstructionsDirtyRef = useRef(isInstructionsDirty);
  const isPromptDirtyRef = useRef(isPromptDirty);
  const isSettingsDirtyRef = useRef(isSettingsDirty);
  titleEditingRef.current = titleEditing;
  instructionsEditingRef.current = instructionsEditing;
  promptEditingRef.current = promptEditing;
  isInstructionsDirtyRef.current = isInstructionsDirty;
  isPromptDirtyRef.current = isPromptDirty;
  isSettingsDirtyRef.current = isSettingsDirty;

  useEffect(() => {
    if (sig === lastSyncedSig.current) return;
    lastSyncedSig.current = sig;

    if (!titleEditingRef.current) setTitleDraft(activity.title);

    setSavedInstructions(activity.instructions);
    if (!instructionsEditingRef.current && !isInstructionsDirtyRef.current) {
      setInstructions(activity.instructions);
    }

    setSavedPrompt(activity.prompt);
    if (!promptEditingRef.current && !isPromptDirtyRef.current) {
      setPrompt(activity.prompt);
    }

    setSavedMaxPoints(String(activity.maxPoints));
    setSavedStartLocal(isoToLocal(activity.startAt));
    setSavedDueLocal(isoToLocal(activity.dueAt));
    setSavedSubmissionType(activity.submissionType);
    setSavedAllowLate(activity.allowLate);
    setSavedAllowResubmission(activity.maxAttempts > 1);
    setSavedMaxAttempts(
      String(activity.maxAttempts > 1 ? activity.maxAttempts : 3),
    );
    if (!isSettingsDirtyRef.current) {
      setMaxPoints(String(activity.maxPoints));
      setStartLocal(isoToLocal(activity.startAt));
      setDueLocal(isoToLocal(activity.dueAt));
      setSubmissionType(activity.submissionType);
      setAllowLate(activity.allowLate);
      setAllowResubmission(activity.maxAttempts > 1);
      setMaxAttempts(
        String(activity.maxAttempts > 1 ? activity.maxAttempts : 3),
      );
    }
  }, [sig, activity]);

  // ---- Handlers ----

  function handleSaveTitle() {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === activity.title) {
      setTitleDraft(activity.title);
      setTitleEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        await updateActivity(activity.id, { title: trimmed });
        setTitleEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save title.');
        setTitleDraft(activity.title);
        setTitleEditing(false);
      }
    });
  }

  function handleChangeTerm(nextTerm: ModuleTerm) {
    if (nextTerm === activity.term) return;
    startTransition(async () => {
      try {
        await setActivityTerm(activity.id, nextTerm);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to change term.');
      }
    });
  }

  function handleSaveInstructions() {
    setError(null);
    startTransition(async () => {
      try {
        await updateActivity(activity.id, { instructions });
        setSavedInstructions(instructions);
        setInstructionsEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save instructions.');
      }
    });
  }

  function handleCancelInstructions() {
    setInstructions(savedInstructions);
    setInstructionsEditing(false);
  }

  function handleSavePrompt() {
    setError(null);
    startTransition(async () => {
      try {
        await updateActivity(activity.id, { prompt });
        setSavedPrompt(prompt);
        setPromptEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save prompt.');
      }
    });
  }

  function handleCancelPrompt() {
    setPrompt(savedPrompt);
    setPromptEditing(false);
  }

  function handleSaveSettings() {
    setError(null);

    const points = Number(maxPoints);
    if (!Number.isFinite(points) || points <= 0) {
      setError('Max points must be a positive number.');
      return;
    }
    if (!startLocal || !dueLocal) {
      setError('Start and due dates are required.');
      return;
    }
    const startIso = localToIso(startLocal);
    const dueIso = localToIso(dueLocal);
    if (new Date(dueIso).getTime() < new Date(startIso).getTime()) {
      setError('Due date must be on or after the start date.');
      return;
    }

    let attemptsToSend = 1;
    if (allowResubmission) {
      const n = Number(maxAttempts);
      if (!Number.isInteger(n) || n < 2 || n > 10) {
        setError('Max attempts must be a whole number between 2 and 10.');
        return;
      }
      attemptsToSend = n;
    }

    startTransition(async () => {
      try {
        await updateActivity(activity.id, {
          maxPoints: points,
          startAt: startIso,
          dueAt: dueIso,
          submissionType,
          allowLate,
          maxAttempts: attemptsToSend,
        });
        setSavedMaxPoints(maxPoints);
        setSavedStartLocal(startLocal);
        setSavedDueLocal(dueLocal);
        setSavedSubmissionType(submissionType);
        setSavedAllowLate(allowLate);
        setSavedAllowResubmission(allowResubmission);
        setSavedMaxAttempts(maxAttempts);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save settings.');
      }
    });
  }

  function handleCancelSettings() {
    setMaxPoints(savedMaxPoints);
    setStartLocal(savedStartLocal);
    setDueLocal(savedDueLocal);
    setSubmissionType(savedSubmissionType);
    setAllowLate(savedAllowLate);
    setAllowResubmission(savedAllowResubmission);
    setMaxAttempts(savedMaxAttempts);
  }

  function handleTogglePublish() {
    if (activity.published) {
      setConfirmUnpublish(true);
      return;
    }
    startTransition(async () => {
      try {
        await setActivityPublished(activity.id, true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to publish.');
      }
    });
  }

  async function handleConfirmUnpublish() {
    await setActivityPublished(activity.id, false);
    router.refresh();
  }

  async function handleDelete() {
    await deleteActivity(activity.id);
    router.push(`/teacher/classes/${classId}?tab=activities`);
  }

  function handleReturnAll() {
    setError(null);
    startTransition(async () => {
      try {
        const count = await returnAllGrades(activity.id);
        if (count === 0) {
          setError('No unreturned grades to release.');
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to return grades.');
      }
    });
  }

  const submissionCount = activity.submissions.length;
  const gradedCount = activity.submissions.filter((s: SubmissionWithGrade) => s.grade).length;

  const unreturnedCount = activity.submissions.filter(
    (s: SubmissionWithGrade) => s.grade && !s.grade.returnedAt,
  ).length;

    const dueShort = new Date(activity.dueAt).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const inputClass =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60';

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ============================== HEADER ============================== */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
              Activity
            </span>
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TERM_ACCENTS[activity.term]}`}
            >
              {MODULE_TERM_LABELS[activity.term]}
            </span>
            {activity.published ? (
              <span className="rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                Published
              </span>
            ) : (
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                Draft · hidden from students
              </span>
            )}
          </div>

          {titleEditing ? (
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle();
                if (e.key === 'Escape') {
                  setTitleDraft(activity.title);
                  setTitleEditing(false);
                }
              }}
              autoFocus
              disabled={isPending}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-2xl font-bold text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
            />
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{activity.title}</h1>
              <button
                type="button"
                onClick={() => setTitleEditing(true)}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Rename"
                title="Rename"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}

          <p className="text-sm text-gray-600">
            Due {dueShort} · {activity.maxPoints} points ·{' '}
            {SUBMISSION_TYPE_LABELS[activity.submissionType]}
            {activity.allowLate && ' · late allowed'}
            {activity.maxAttempts > 1 && ` · up to ${activity.maxAttempts} attempts`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {activity.published ? (
            <button
              type="button"
              onClick={handleTogglePublish}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <EyeOff className="h-4 w-4" />
              Unpublish
            </button>
          ) : (
            <button
              type="button"
              onClick={handleTogglePublish}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Publish
            </button>
          )}
        </div>
      </div>

      {/* ============================== TWO COLUMNS ============================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LEFT: content + attachments */}
        <div className="space-y-6 lg:col-span-2">
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {/* Instructions */}
            <div className="p-5">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-[15px] font-bold text-gray-900">Instructions</h2>
                  <p className="text-xs text-gray-500">
                    Background or directions students read before starting.
                  </p>
                </div>
                {instructionsEditing && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className={isInstructionsDirty ? 'text-amber-600' : 'text-gray-400'}>
                      {isInstructionsDirty ? 'Unsaved changes' : 'No changes'}
                    </span>
                    <button
                      type="button"
                      onClick={handleCancelInstructions}
                      disabled={isPending}
                      className="rounded-md border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveInstructions}
                      disabled={isPending || !isInstructionsDirty}
                      className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Save
                    </button>
                  </div>
                )}
              </div>

              {instructionsEditing ? (
                <MarkdownEditor
                  value={instructions}
                  onChange={setInstructions}
                  placeholder="e.g. 'Read chapters 3–5, then complete the worksheet attached below.'"
                  rows={6}
                  disabled={isPending}
                />
              ) : savedInstructions.trim() ? (
                <button
                  type="button"
                  onClick={() => setInstructionsEditing(true)}
                  className="block w-full cursor-text rounded-lg px-2 py-2 text-left transition hover:bg-gray-50"
                  aria-label="Edit instructions"
                >
                  <MarkdownContent body={savedInstructions} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setInstructionsEditing(true)}
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-4 py-3 text-left text-sm text-gray-600 hover:border-red-300 hover:bg-red-50/40"
                >
                  <Plus className="h-4 w-4" />
                  Add instructions
                </button>
              )}
            </div>

            {/* Questions / Tasks */}
            <div className="border-t border-gray-100 p-5">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-[15px] font-bold text-gray-900">Questions / Tasks</h2>
                  <p className="text-xs text-gray-500">What students will answer or do.</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAiPromptOpen(true)}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Generate with AI
                </button>
                {promptEditing && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className={isPromptDirty ? 'text-amber-600' : 'text-gray-400'}>
                      {isPromptDirty ? 'Unsaved changes' : 'No changes'}
                    </span>
                    <button
                      type="button"
                      onClick={handleCancelPrompt}
                      disabled={isPending}
                      className="rounded-md border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePrompt}
                      disabled={isPending || !isPromptDirty}
                      className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Save
                    </button>
                  </div>
                                )}
                </div>
              </div>

              {promptEditing ? (
                <MarkdownEditor
                  value={prompt}
                  onChange={setPrompt}
                  placeholder="e.g. 'Compute the simple interest for the three cases below and show your solution.'"
                  rows={4}
                  disabled={isPending}
                />
              ) : savedPrompt.trim() ? (
                <button
                  type="button"
                  onClick={() => setPromptEditing(true)}
                  className="block w-full cursor-text rounded-lg px-2 py-2 text-left transition hover:bg-gray-50"
                  aria-label="Edit prompt"
                >
                  <MarkdownContent body={savedPrompt} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPromptEditing(true)}
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-4 py-3 text-left text-sm text-gray-600 hover:border-red-300 hover:bg-red-50/40"
                >
                  <Plus className="h-4 w-4" />
                  Add questions or tasks
                </button>
              )}
            </div>
          </section>

          {/* Attachments (unchanged component) */}
          <ActivityAttachmentsPanel
            activityId={activity.id}
            classId={classId}
            initialAttachments={initialAttachments}
            canEdit={true}
          />
        </div>

        {/* RIGHT: Settings */}
        <aside className="lg:col-span-1">
          <section className="sticky top-4 space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold text-gray-900">Settings</h2>
              {isSettingsDirty && <span className="text-xs text-amber-600">Unsaved</span>}
            </div>

            {/* Term (saves immediately, like before) */}
            <div>
              <label htmlFor="set-term" className="mb-1 block text-xs font-semibold text-gray-700">
                Term
              </label>
              <select
                id="set-term"
                value={activity.term}
                onChange={(e) => handleChangeTerm(e.target.value as ModuleTerm)}
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="set-points" className="mb-1 block text-xs font-semibold text-gray-700">
                  Max points
                </label>
                <input
                  id="set-points"
                  type="text"
                  inputMode="decimal"
                  maxLength={6}
                  value={maxPoints}
                  onChange={(e) =>
                    setMaxPoints(
                      e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'),
                    )
                  }
                  disabled={isPending}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="set-type" className="mb-1 block text-xs font-semibold text-gray-700">
                  Submission
                </label>
                <select
                  id="set-type"
                  value={submissionType}
                  onChange={(e) => setSubmissionType(e.target.value as SubmissionType)}
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
            </div>

            {/* Schedule */}
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Schedule
              </p>
              <div>
                <label htmlFor="set-start" className="mb-1 block text-xs font-semibold text-gray-700">
                  Opens
                </label>
                <input
                  id="set-start"
                  type="datetime-local"
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                  disabled={isPending}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="set-due" className="mb-1 block text-xs font-semibold text-gray-700">
                  Due
                </label>
                <input
                  id="set-due"
                  type="datetime-local"
                  value={dueLocal}
                  onChange={(e) => setDueLocal(e.target.value)}
                  disabled={isPending}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Submission rules */}
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Submission rules
              </p>
              <label className="flex items-center gap-2 text-sm text-gray-700">
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
                <label className="flex items-center gap-2 text-sm text-gray-700">
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
                  <div className="ml-6 mt-2 flex items-center gap-2">
                    <label htmlFor="set-attempts" className="text-xs text-gray-600">
                      Max attempts
                    </label>
                    <input
                      id="set-attempts"
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      value={maxAttempts}
                      onChange={(e) => setMaxAttempts(e.target.value.replace(/\D/g, ''))}
                      disabled={isPending}
                      className="w-16 rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
                    />
                  </div>
                ) : (
                  <p className="ml-6 mt-1 text-xs text-gray-500">
                    Students get one attempt by default.
                  </p>
                )}
              </div>
            </div>

            {isSettingsDirty && (
              <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={handleCancelSettings}
                  disabled={isPending}
                  className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save settings
                </button>
              </div>
            )}

            {/* Delete */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-red-100 pt-4">
              <div>
                <p className="text-sm font-semibold text-red-800">Delete activity</p>
                <p className="text-xs text-gray-500">Removes all submissions and files.</p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          </section>
        </aside>
      </div>

      {/* Submissions (unchanged) */}
      <SubmissionsPanel
        activity={activity}
        classId={classId}
        unreturnedCount={unreturnedCount}
        gradedCount={gradedCount}
        submissionCount={submissionCount}
        onReturnAll={handleReturnAll}
        isPending={isPending}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete activity?"
        message={`"${activity.title}" and all ${submissionCount} submission${submissionCount === 1 ? '' : 's'} (and any attached files) will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />

        <AIActivityPromptModal
        open={aiPromptOpen}
        activityId={activity.id}
        hasExisting={prompt.trim().length > 0}
        onClose={() => setAiPromptOpen(false)}
        onGenerated={handleAiQuestions}
      />

      <ConfirmDialog
        open={confirmUnpublish}
        title="Unpublish this activity?"
        message="Students will no longer see it in their activities list. Existing submissions and grades are kept."
        confirmLabel="Unpublish"
        onConfirm={handleConfirmUnpublish}
        onClose={() => setConfirmUnpublish(false)}
      />
    </div>
  );
}
      

// ============================================================================
// Submissions panel
// ============================================================================

interface SubmissionsPanelProps {
  activity: ActivityWithAllSubmissions;
  classId: string;
  unreturnedCount: number;
  gradedCount: number;
  submissionCount: number;
  onReturnAll: () => void;
  isPending: boolean;
}

function SubmissionsPanel({
  activity,
  classId,
  unreturnedCount,
  gradedCount,
  submissionCount,
  onReturnAll,
  isPending,
}: SubmissionsPanelProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Submissions</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {submissionCount} total · {gradedCount} graded · {unreturnedCount} awaiting release
          </p>
        </div>
        {unreturnedCount > 0 && (
          <button
            type="button"
            onClick={onReturnAll}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            Release all {unreturnedCount} grade{unreturnedCount === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {submissionCount === 0 ? (
        <p className="text-sm italic text-gray-400">No submissions yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {activity.submissions.map((s: SubmissionWithGrade) => (
            <SubmissionRow key={s.id} submission={s} activity={activity} classId={classId} />
          ))}
        </ul>
      )}
    </section>
  );
}

interface SubmissionRowProps {
  submission: SubmissionWithGrade;
  activity: ActivityWithAllSubmissions;
  classId: string;
}

function SubmissionRow({ submission, activity, classId }: SubmissionRowProps) {
  const grade = submission.grade;
  const attachmentCount = submission.attachments.length;

  let statusPill: { className: string; label: string };
  if (!grade) {
    statusPill = submission.isLate
      ? { className: 'bg-amber-100 text-amber-800', label: 'Submitted (late)' }
      : { className: 'bg-blue-100 text-blue-800', label: 'Submitted' };
  } else if (!grade.returnedAt) {
    statusPill = { className: 'bg-purple-100 text-purple-800', label: 'Graded (not released)' };
  } else {
    statusPill = { className: 'bg-green-100 text-green-800', label: 'Graded & released' };
  }

  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <Link
          href={`/teacher/classes/${classId}/activities/${activity.id}/submissions/${submission.id}`}
          className="block truncate text-sm font-medium text-gray-900 hover:text-red-600"
        >
          {submission.studentName || submission.studentEmail || 'Unknown'}
        </Link>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
          <span>{new Date(submission.submittedAt).toLocaleString()}</span>
          {activity.maxAttempts > 1 && (
            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
              Attempt {submission.attemptNumber} / {activity.maxAttempts}
            </span>
          )}
          {attachmentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3 w-3" />
              {attachmentCount} file{attachmentCount === 1 ? '' : 's'}
            </span>
          )}
          {grade && (
            <span>
              <span className="font-semibold text-gray-700">{grade.score}</span>
              <span className="text-gray-400"> / {activity.maxPoints}</span>
            </span>
          )}
        </div>
      </div>

      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusPill.className}`}>
        {statusPill.label}
      </span>
    </li>
  );
}