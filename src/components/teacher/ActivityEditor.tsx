'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Pencil,
  Save,
  Loader2,
  Sparkles,
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
import {
  type FinishAction,
  HeaderActions,
  EditorTabs,
  SettingsDisclosure,
  editorInputClass,
  editorLabelClass,
  editorCheckboxClass,
} from '@/components/teacher/EditorParts';

interface ActivityEditorProps {
  activity: ActivityWithAllSubmissions;
  classId: string;
  initialAttachments: ActivityAttachment[];
}

type UpdatePatch = Parameters<typeof updateActivity>[1];

function isoToLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string): string {
  return new Date(local).toISOString();
}

function formatLocalShort(local: string): string {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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
            s.grade ? `${s.grade.score}:${s.grade.returnedAt ?? ''}` : 'none'
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
  const activitiesHref = `/teacher/classes/${classId}?tab=activities`;
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'edit' | 'submissions'>('edit');

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
  const [allowResubmission, setAllowResubmission] = useState(activity.maxAttempts > 1);
  const [savedAllowResubmission, setSavedAllowResubmission] = useState(activity.maxAttempts > 1);
  const [maxAttempts, setMaxAttempts] = useState(String(activity.maxAttempts > 1 ? activity.maxAttempts : 3));
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
  const [isFinishing, startFinishing] = useTransition();
  const [finishing, setFinishing] = useState<FinishAction | null>(null);
  const busy = isPending || isFinishing;

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);

  function handleAiQuestions(markdown: string, mode: 'replace' | 'append') {
    setPrompt((current) =>
      mode === 'append' && current.trim() ? `${current.trim()}\n\n${markdown}` : markdown,
    );
    setPromptEditing(true);
  }

  // ---- Sync with server data without clobbering in-progress edits ----
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
    setSavedMaxAttempts(String(activity.maxAttempts > 1 ? activity.maxAttempts : 3));
    if (!isSettingsDirtyRef.current) {
      setMaxPoints(String(activity.maxPoints));
      setStartLocal(isoToLocal(activity.startAt));
      setDueLocal(isoToLocal(activity.dueAt));
      setSubmissionType(activity.submissionType);
      setAllowLate(activity.allowLate);
      setAllowResubmission(activity.maxAttempts > 1);
      setMaxAttempts(String(activity.maxAttempts > 1 ? activity.maxAttempts : 3));
    }
  }, [sig, activity]);

  // ---- Settings validation (shared by inline save and top buttons) ----
  function buildSettingsPatch(): { patch: UpdatePatch | null; error: string | null } {
    if (!isSettingsDirty) return { patch: null, error: null };

    const points = Number(maxPoints);
    if (!Number.isFinite(points) || points <= 0) {
      return { patch: null, error: 'Max points must be a positive number.' };
    }
    if (!startLocal || !dueLocal) {
      return { patch: null, error: 'Start and due dates are required.' };
    }
    const startIso = localToIso(startLocal);
    const dueIso = localToIso(dueLocal);
    if (new Date(dueIso).getTime() < new Date(startIso).getTime()) {
      return { patch: null, error: 'Due date must be on or after the open date.' };
    }

    let attemptsToSend = 1;
    if (allowResubmission) {
      const n = Number(maxAttempts);
      if (!Number.isInteger(n) || n < 2 || n > 10) {
        return { patch: null, error: 'Max attempts must be a whole number between 2 and 10.' };
      }
      attemptsToSend = n;
    }

    return {
      patch: {
        maxPoints: points,
        startAt: startIso,
        dueAt: dueIso,
        submissionType,
        allowLate,
        maxAttempts: attemptsToSend,
      } as UpdatePatch,
      error: null,
    };
  }

  function markSettingsSaved() {
    setSavedMaxPoints(maxPoints);
    setSavedStartLocal(startLocal);
    setSavedDueLocal(dueLocal);
    setSavedSubmissionType(submissionType);
    setSavedAllowLate(allowLate);
    setSavedAllowResubmission(allowResubmission);
    setSavedMaxAttempts(maxAttempts);
  }

  // Saves every unsaved part of the page.
  async function persistAll(settingsPatch: UpdatePatch | null) {
    if (isInstructionsDirty) {
      await updateActivity(activity.id, { instructions });
      setSavedInstructions(instructions);
    }
    setInstructionsEditing(false);

    if (isPromptDirty) {
      await updateActivity(activity.id, { prompt });
      setSavedPrompt(prompt);
    }
    setPromptEditing(false);

    if (settingsPatch) {
      await updateActivity(activity.id, settingsPatch);
      markSettingsSaved();
    }
  }

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
        setError(e instanceof Error ? e.message : 'Failed to save questions.');
      }
    });
  }

  function handleCancelPrompt() {
    setPrompt(savedPrompt);
    setPromptEditing(false);
  }

  function handleSaveSettings() {
    setError(null);
    const { patch, error: err } = buildSettingsPatch();
    if (err) {
      setError(err);
      return;
    }
    if (!patch) return;
    startTransition(async () => {
      try {
        await updateActivity(activity.id, patch);
        markSettingsSaved();
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

  // Top buttons: save everything (and maybe publish), then back to Activities.
  function handleFinish(action: FinishAction) {
    setError(null);
    const { patch, error: err } = buildSettingsPatch();
    if (err) {
      setError(err);
      setTab('edit');
      return;
    }
    setFinishing(action);
    startFinishing(async () => {
      try {
        await persistAll(patch);
        if (action === 'publish' && !activity.published) {
          await setActivityPublished(activity.id, true);
        }
        router.push(activitiesHref);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save.');
        setFinishing(null);
      }
    });
  }

  async function handleConfirmUnpublish() {
    await setActivityPublished(activity.id, false);
    router.refresh();
  }

  async function handleDelete() {
    await deleteActivity(activity.id);
    router.push(activitiesHref);
  }

  function handleReturnAll() {
    setError(null);
    startTransition(async () => {
      try {
        const count = await returnAllGrades(activity.id);
        if (count === 0) setError('No unreturned grades to release.');
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

  // Summaries for the folded settings rows
  const rulesSummary = `${allowLate ? 'Late ok' : 'No late'} · ${
    allowResubmission ? `${maxAttempts || '?'} tries` : '1 try'
  }`;
  const startMs = new Date(startLocal).getTime();
  const scheduleSummary = `${MODULE_TERM_LABELS[activity.term]} · ${
    Number.isNaN(startMs) ? '' : startMs <= Date.now() ? 'open now' : `opens ${formatLocalShort(startLocal)}`
  }`;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ============================== HEADER ============================== */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
              Activity
            </span>
            {activity.published ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                Published
              </span>
            ) : (
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600">
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
              disabled={busy}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-2xl font-bold text-zinc-900 focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10 disabled:opacity-60"
            />
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-zinc-900">{activity.title}</h1>
              <button
                type="button"
                onClick={() => setTitleEditing(true)}
                className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Rename"
                title="Rename"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <HeaderActions
          published={activity.published}
          busy={busy}
          finishing={isFinishing ? finishing : null}
          onFinish={handleFinish}
          onUnpublish={() => setConfirmUnpublish(true)}
          onDelete={() => setConfirmDelete(true)}
          deleteLabel="Delete activity"
        />
      </div>

      <EditorTabs
        tabs={[
          { key: 'edit', label: 'Edit' },
          { key: 'submissions', label: 'Submissions', count: submissionCount },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'submissions' ? (
        <SubmissionsPanel
          activity={activity}
          classId={classId}
          unreturnedCount={unreturnedCount}
          gradedCount={gradedCount}
          submissionCount={submissionCount}
          onReturnAll={handleReturnAll}
          isPending={busy}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* LEFT: one content card */}
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] lg:col-span-2">
            {/* Instructions */}
            <div className="p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-bold text-zinc-900">Instructions</h2>
                {instructionsEditing && (
                  <InlineSaveBar
                    dirty={isInstructionsDirty}
                    busy={busy}
                    onCancel={handleCancelInstructions}
                    onSave={handleSaveInstructions}
                  />
                )}
              </div>

              {instructionsEditing ? (
                <MarkdownEditor
                  value={instructions}
                  onChange={setInstructions}
                  placeholder="e.g. 'Read chapters 3–5, then complete the worksheet attached below.'"
                  rows={6}
                  disabled={busy}
                />
              ) : savedInstructions.trim() ? (
                <button
                  type="button"
                  onClick={() => setInstructionsEditing(true)}
                  className="block w-full cursor-text rounded-lg px-2 py-2 text-left transition hover:bg-zinc-50"
                  aria-label="Edit instructions"
                >
                  <MarkdownContent body={savedInstructions} />
                </button>
              ) : (
                <AddButton label="Add instructions" onClick={() => setInstructionsEditing(true)} />
              )}
            </div>

            {/* Questions / Tasks */}
            <div className="border-t border-zinc-100 p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-bold text-zinc-900">Questions / tasks</h2>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAiPromptOpen(true)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate with AI
                  </button>
                  {promptEditing && (
                    <InlineSaveBar
                      dirty={isPromptDirty}
                      busy={busy}
                      onCancel={handleCancelPrompt}
                      onSave={handleSavePrompt}
                    />
                  )}
                </div>
              </div>

              {promptEditing ? (
                <MarkdownEditor
                  value={prompt}
                  onChange={setPrompt}
                  placeholder="e.g. 'Compute the simple interest for the three cases below and show your solution.'"
                  rows={4}
                  disabled={busy}
                />
              ) : savedPrompt.trim() ? (
                <button
                  type="button"
                  onClick={() => setPromptEditing(true)}
                  className="block w-full cursor-text rounded-lg px-2 py-2 text-left transition hover:bg-zinc-50"
                  aria-label="Edit questions"
                >
                  <MarkdownContent body={savedPrompt} />
                </button>
              ) : (
                <AddButton label="Add questions or tasks" onClick={() => setPromptEditing(true)} />
              )}
            </div>

            {/* Attachments (compact) */}
            <div className="border-t border-zinc-100 px-5 py-4">
              <ActivityAttachmentsPanel
                activityId={activity.id}
                classId={classId}
                initialAttachments={initialAttachments}
                canEdit={true}
                variant="inline"
              />
            </div>
          </section>

          {/* RIGHT: settings */}
          <aside className="lg:col-span-1">
            <section className="sticky top-20 rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-bold text-zinc-900">Settings</h2>
                {isSettingsDirty && <span className="text-xs font-medium text-amber-600">Unsaved</span>}
              </div>

              {/* Always visible */}
              <div className="space-y-3 pb-4">
                <div>
                  <label htmlFor="set-due" className={editorLabelClass}>
                    Due
                  </label>
                  <input
                    id="set-due"
                    type="datetime-local"
                    value={dueLocal}
                    onChange={(e) => setDueLocal(e.target.value)}
                    disabled={busy}
                    className={editorInputClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="set-points" className={editorLabelClass}>
                      Points
                    </label>
                    <input
                      id="set-points"
                      type="text"
                      inputMode="decimal"
                      maxLength={6}
                      value={maxPoints}
                      onChange={(e) =>
                        setMaxPoints(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))
                      }
                      disabled={busy}
                      className={editorInputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="set-type" className={editorLabelClass}>
                      Submit as
                    </label>
                    <select
                      id="set-type"
                      value={submissionType}
                      onChange={(e) => setSubmissionType(e.target.value as SubmissionType)}
                      disabled={busy}
                      className={editorInputClass}
                    >
                      {SUBMISSION_TYPES.map((s) => (
                        <option key={s} value={s}>
                          {SUBMISSION_TYPE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Folded rows */}
              <SettingsDisclosure title="Late and attempts" summary={rulesSummary}>
                <label className="flex items-start gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={allowLate}
                    onChange={(e) => setAllowLate(e.target.checked)}
                    disabled={busy}
                    className={editorCheckboxClass}
                  />
                  Allow late submissions
                </label>
                <div>
                  <label className="flex items-start gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={allowResubmission}
                      onChange={(e) => setAllowResubmission(e.target.checked)}
                      disabled={busy}
                      className={editorCheckboxClass}
                    />
                    Allow resubmission
                  </label>
                  {allowResubmission ? (
                    <div className="ml-6 mt-2 flex items-center gap-2">
                      <label htmlFor="set-attempts" className="text-xs text-zinc-600">
                        Max attempts
                      </label>
                      <input
                        id="set-attempts"
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        value={maxAttempts}
                        onChange={(e) => setMaxAttempts(e.target.value.replace(/\D/g, ''))}
                        disabled={busy}
                        className="w-16 rounded-lg border border-zinc-200 px-2 py-1 text-sm focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10 disabled:opacity-60"
                      />
                    </div>
                  ) : (
                    <p className="ml-6 mt-1 text-xs text-zinc-500">Students get one attempt.</p>
                  )}
                </div>
              </SettingsDisclosure>

              <SettingsDisclosure title="Term and schedule" summary={scheduleSummary}>
                <div>
                  <label htmlFor="set-term" className={editorLabelClass}>
                    Term
                  </label>
                  <select
                    id="set-term"
                    value={activity.term}
                    onChange={(e) => handleChangeTerm(e.target.value as ModuleTerm)}
                    disabled={busy}
                    className={editorInputClass}
                  >
                    {MODULE_TERMS.map((t) => (
                      <option key={t} value={t}>
                        {MODULE_TERM_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="set-start" className={editorLabelClass}>
                    Opens
                  </label>
                  <input
                    id="set-start"
                    type="datetime-local"
                    value={startLocal}
                    onChange={(e) => setStartLocal(e.target.value)}
                    disabled={busy}
                    className={editorInputClass}
                  />
                </div>
              </SettingsDisclosure>

              {isSettingsDirty && (
                <div className="flex items-center justify-end gap-2 border-t border-zinc-100 pt-4">
                  <button
                    type="button"
                    onClick={handleCancelSettings}
                    disabled={busy}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save settings
                  </button>
                </div>
              )}
            </section>
          </aside>
        </div>
      )}

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

      <AIActivityPromptModal
        open={aiPromptOpen}
        activityId={activity.id}
        hasExisting={prompt.trim().length > 0}
        onClose={() => setAiPromptOpen(false)}
        onGenerated={handleAiQuestions}
      />
    </div>
  );
}

// ============================================================================
// Small helpers
// ============================================================================

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-left text-sm font-medium text-zinc-600 transition hover:border-red-300 hover:bg-red-50/40 hover:text-red-700"
    >
      <Plus className="h-4 w-4" />
      {label}
    </button>
  );
}

function InlineSaveBar({
  dirty,
  busy,
  onCancel,
  onSave,
}: {
  dirty: boolean;
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={dirty ? 'text-amber-600' : 'text-zinc-400'}>
        {dirty ? 'Unsaved changes' : 'No changes'}
      </span>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={busy || !dirty}
        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        Save
      </button>
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
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-600">
          {submissionCount} total · {gradedCount} graded · {unreturnedCount} awaiting release
        </p>
        {unreturnedCount > 0 && (
          <button
            type="button"
            onClick={onReturnAll}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            Release all {unreturnedCount} grade{unreturnedCount === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {submissionCount === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">No submissions yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
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
      ? { className: 'bg-amber-50 text-amber-700', label: 'Submitted (late)' }
      : { className: 'bg-blue-50 text-blue-700', label: 'Submitted' };
  } else if (!grade.returnedAt) {
    statusPill = { className: 'bg-purple-50 text-purple-700', label: 'Graded (not released)' };
  } else {
    statusPill = { className: 'bg-emerald-50 text-emerald-700', label: 'Graded and released' };
  }

  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <Link
          href={`/teacher/classes/${classId}/activities/${activity.id}/submissions/${submission.id}`}
          className="block truncate text-sm font-semibold text-zinc-900 hover:text-red-600"
        >
          {submission.studentName || submission.studentEmail || 'Unknown'}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
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
              <span className="font-semibold text-zinc-700">{grade.score}</span>
              <span className="text-zinc-400"> / {activity.maxPoints}</span>
            </span>
          )}
        </div>
      </div>

      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusPill.className}`}>
        {statusPill.label}
      </span>
    </li>
  );
}