'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Pencil,
  Trash2,
  Save,
  Loader2,
  Tag,
  Eye,
  EyeOff,
  Calendar,
  Award,
  CheckCheck,
  Paperclip,
} from 'lucide-react';
import MarkdownEditor from '@/components/dashboard/MarkdownEditor';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
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
    a.allowResubmission ? 1 : 0,
    a.submissionType,
    a.published ? 1 : 0,
    a.submissions
      .map(
        (s) =>
          `${s.id}:${s.studentId}:${s.isLate ? 1 : 0}:${
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

  // Title
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(activity.title);

  // Instructions (intro / context)
  const [instructions, setInstructions] = useState(activity.instructions);
  const [savedInstructions, setSavedInstructions] = useState(activity.instructions);
  const [instructionsEditing, setInstructionsEditing] = useState(false);
  const isInstructionsDirty = instructions !== savedInstructions;

  // Prompt (the question / task)
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
  const [allowResubmission, setAllowResubmission] = useState(activity.allowResubmission);
  const [savedAllowResubmission, setSavedAllowResubmission] = useState(activity.allowResubmission);

  const isSettingsDirty =
    maxPoints !== savedMaxPoints ||
    startLocal !== savedStartLocal ||
    dueLocal !== savedDueLocal ||
    submissionType !== savedSubmissionType ||
    allowLate !== savedAllowLate ||
    allowResubmission !== savedAllowResubmission;

  // Async / dialogs
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

  // Prop-sync
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
    setSavedAllowResubmission(activity.allowResubmission);
    if (!isSettingsDirtyRef.current) {
      setMaxPoints(String(activity.maxPoints));
      setStartLocal(isoToLocal(activity.startAt));
      setDueLocal(isoToLocal(activity.dueAt));
      setSubmissionType(activity.submissionType);
      setAllowLate(activity.allowLate);
      setAllowResubmission(activity.allowResubmission);
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

    startTransition(async () => {
      try {
        await updateActivity(activity.id, {
          maxPoints: points,
          startAt: startIso,
          dueAt: dueIso,
          submissionType,
          allowLate,
          allowResubmission,
        });
        setSavedMaxPoints(maxPoints);
        setSavedStartLocal(startLocal);
        setSavedDueLocal(dueLocal);
        setSavedSubmissionType(submissionType);
        setSavedAllowLate(allowLate);
        setSavedAllowResubmission(allowResubmission);
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

  // ---- Derived ----
  const submissionCount = activity.submissions.length;
  const gradedCount = activity.submissions.filter((s: SubmissionWithGrade) => s.grade).length;
  const unreturnedCount = activity.submissions.filter(
    (s: SubmissionWithGrade) => s.grade && !s.grade.returnedAt,
  ).length;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Title bar */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
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
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${TERM_ACCENTS[activity.term]}`}
          >
            <Tag className="h-3 w-3" />
            {MODULE_TERM_LABELS[activity.term]}
          </span>
          <select
            value={activity.term}
            onChange={(e) => handleChangeTerm(e.target.value as ModuleTerm)}
            disabled={isPending}
            aria-label="Change term"
            title="Change term"
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {MODULE_TERMS.map((t) => (
              <option key={t} value={t}>
                {MODULE_TERM_LABELS[t]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleTogglePublish}
            disabled={isPending}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
              activity.published
                ? 'bg-green-100 text-green-800 hover:bg-green-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            } disabled:opacity-50`}
          >
            {activity.published ? (
              <>
                <Eye className="h-3 w-3" />
                Published
              </>
            ) : (
              <>
                <EyeOff className="h-3 w-3" />
                Draft — click to publish
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Opens {new Date(activity.startAt).toLocaleString()}
        </span>
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Due {new Date(activity.dueAt).toLocaleString()}
        </span>
        <span className="inline-flex items-center gap-1">
          <Award className="h-3 w-3" />
          {activity.maxPoints} pts
        </span>
        <span>
          {SUBMISSION_TYPE_LABELS[activity.submissionType]}
          {activity.allowLate && ' · late ok'}
          {activity.allowResubmission && ' · resubmit ok'}
        </span>
      </div>

      {/* Instructions (intro / context) */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Instructions
            </h2>
            <p className="text-xs text-gray-500">
              Background, context, or directions students read before starting.
            </p>
          </div>
          {instructionsEditing ? (
            <div className="flex items-center gap-2 text-xs">
              {isInstructionsDirty ? (
                <span className="text-amber-600">Unsaved changes</span>
              ) : (
                <span className="text-gray-400">No changes</span>
              )}
              <button
                type="button"
                onClick={handleCancelInstructions}
                disabled={isPending}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveInstructions}
                disabled={isPending || !isInstructionsDirty}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setInstructionsEditing(true)}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Edit instructions"
              title="Edit instructions"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {instructionsEditing ? (
          <MarkdownEditor
            value={instructions}
            onChange={setInstructions}
            placeholder="e.g. 'Read chapters 3–5, then complete the worksheet attached below.' Markdown supported."
            rows={6}
            disabled={isPending}
          />
        ) : savedInstructions.trim() ? (
          <MarkdownContent body={savedInstructions} />
        ) : (
          <p className="text-sm italic text-gray-400">
            No instructions yet. Click the pencil icon to add some.
          </p>
        )}
      </section>

      {/* Prompt (the question / task) */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Question / prompt
            </h2>
            <p className="text-xs text-gray-500">
              The actual question or task students will answer or complete.
            </p>
          </div>
          {promptEditing ? (
            <div className="flex items-center gap-2 text-xs">
              {isPromptDirty ? (
                <span className="text-amber-600">Unsaved changes</span>
              ) : (
                <span className="text-gray-400">No changes</span>
              )}
              <button
                type="button"
                onClick={handleCancelPrompt}
                disabled={isPending}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePrompt}
                disabled={isPending || !isPromptDirty}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPromptEditing(true)}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Edit prompt"
              title="Edit prompt"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {promptEditing ? (
          <MarkdownEditor
            value={prompt}
            onChange={setPrompt}
            placeholder="e.g. 'Compare the authors' theses and explain which you find more persuasive.' Markdown supported."
            rows={4}
            disabled={isPending}
          />
        ) : savedPrompt.trim() ? (
          <MarkdownContent body={savedPrompt} />
        ) : (
          <p className="text-sm italic text-gray-400">
            No prompt yet. Click the pencil icon to add the question students will answer.
          </p>
        )}
      </section>

      {/* Attachments */}
      <ActivityAttachmentsPanel
        activityId={activity.id}
        classId={classId}
        initialAttachments={initialAttachments}
        canEdit={true}
      />

      {/* Settings */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Settings</h2>
          {isSettingsDirty && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-amber-600">Unsaved changes</span>
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
                Save
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Max points</label>
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
            <label className="mb-1 block text-xs font-medium text-gray-700">Submission type</label>
            <select
              value={submissionType}
              onChange={(e) => setSubmissionType(e.target.value as SubmissionType)}
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
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Start date (visible to students)</label>
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              disabled={isPending}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Due date</label>
            <input
              type="datetime-local"
              value={dueLocal}
              onChange={(e) => setDueLocal(e.target.value)}
              disabled={isPending}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
            />
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
      </section>

      {/* Submissions */}
      <SubmissionsPanel
        activity={activity}
        classId={classId}
        unreturnedCount={unreturnedCount}
        gradedCount={gradedCount}
        submissionCount={submissionCount}
        onReturnAll={handleReturnAll}
        isPending={isPending}
      />

      {/* Danger zone */}
      <section className="rounded-xl border border-red-200 bg-red-50/30 p-4">
        <h2 className="text-sm font-semibold text-red-900">Danger zone</h2>
        <p className="mt-1 text-xs text-red-700">
          Deleting this activity is permanent and removes all submissions and attached files.
        </p>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete activity
        </button>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete activity?"
        message={`"${activity.title}" and all ${submissionCount} submission${submissionCount === 1 ? '' : 's'} (and any attached files) will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
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
// Submissions panel (unchanged from previous version)
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