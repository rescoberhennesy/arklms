'use client';

import { useState, useTransition, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Save, Loader2, Plus, Lock, Sparkles } from 'lucide-react';
import MarkdownEditor from '@/components/dashboard/MarkdownEditor';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import QuestionRow, { QuestionEditModal } from '@/components/teacher/QuestionEditor';
import AIQuizGenerator from '@/components/teacher/ai/AIQuizGenerator';
import QuizAttemptsPanel from '@/components/teacher/QuizAttemptsPanel';
import {
  updateActivity,
  setActivityTerm,
  setActivityPublished,
  deleteActivity,
} from '@/lib/actions/activities';
import {
  getTeacherQuizView,
  updateQuizConfig,
  createQuizQuestion,
} from '@/lib/actions/quizzes';
import { type ActivityWithAllSubmissions } from '@/lib/types/activities';
import {
  type ModuleTerm,
  MODULE_TERMS,
  MODULE_TERM_LABELS,
} from '@/lib/types/modules';
import {
  type TeacherQuizView,
  type QuizAttemptListItem,
  type QuestionKind,
  QUESTION_KINDS,
  QUESTION_KIND_LABELS,
} from '@/lib/types/quizzes';
import type { ActivityAttachment } from '@/lib/types/activities';
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

interface QuizEditorProps {
  activity: ActivityWithAllSubmissions;
  classId: string;
  initialQuizView: TeacherQuizView;
  initialAttempts: QuizAttemptListItem[];
  initialAttachments: ActivityAttachment[];
}

type PreparedSettings = {
  error: string | null;
  activityPatch: Record<string, unknown>;
  configPatch: Record<string, unknown>;
};

function toRoman(n: number): string {
  const map: [number, string][] = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  for (const [v, s] of map) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

const MAX_BULK_ITEMS = 20;

function isoToLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string): string {
  return new Date(local).toISOString();
}

function activitySignature(a: ActivityWithAllSubmissions): string {
  return [a.id, a.title, a.term, a.instructions, a.dueAt, a.published ? 1 : 0].join('§');
}

function quizConfigSignature(view: TeacherQuizView): string {
  return [
    String(view.config.timeLimitMinutes ?? 'null'),
    view.config.shuffleQuestions ? 1 : 0,
    view.config.autoReleaseGrade ? 1 : 0,
    view.config.showCorrectAnswers ? 1 : 0,
    view.config.allowLate ? 1 : 0,
  ].join('§');
}

export default function QuizEditor({
  activity,
  classId,
  initialQuizView,
  initialAttempts,
  initialAttachments,
}: QuizEditorProps) {
  const router = useRouter();
  const activitiesHref = `/teacher/classes/${classId}?tab=activities`;
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'edit' | 'attempts'>('edit');
  const [isPending, startTransition] = useTransition();
  const [isFinishing, startFinishing] = useTransition();
  const [finishing, setFinishing] = useState<FinishAction | null>(null);
  const busy = isPending || isFinishing;

  const [quizView, setQuizView] = useState<TeacherQuizView>(initialQuizView);

  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(activity.title);

  const [instructions, setInstructions] = useState(activity.instructions);
  const [savedInstructions, setSavedInstructions] = useState(activity.instructions);
  const [descEditing, setDescEditing] = useState(false);
  const isDescDirty = instructions !== savedInstructions;

  const [dueLocal, setDueLocal] = useState(isoToLocal(activity.dueAt));
  const [savedDueLocal, setSavedDueLocal] = useState(isoToLocal(activity.dueAt));

  const [hasTimeLimit, setHasTimeLimit] = useState(initialQuizView.config.timeLimitMinutes !== null);
  const [savedHasTimeLimit, setSavedHasTimeLimit] = useState(initialQuizView.config.timeLimitMinutes !== null);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(String(initialQuizView.config.timeLimitMinutes ?? 30));
  const [savedTimeLimitMinutes, setSavedTimeLimitMinutes] = useState(
    String(initialQuizView.config.timeLimitMinutes ?? 30),
  );
  const [shuffleQuestions, setShuffleQuestions] = useState(initialQuizView.config.shuffleQuestions);
  const [savedShuffleQuestions, setSavedShuffleQuestions] = useState(initialQuizView.config.shuffleQuestions);
  const [autoReleaseGrade, setAutoReleaseGrade] = useState(initialQuizView.config.autoReleaseGrade);
  const [savedAutoReleaseGrade, setSavedAutoReleaseGrade] = useState(initialQuizView.config.autoReleaseGrade);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(initialQuizView.config.showCorrectAnswers);
  const [savedShowCorrectAnswers, setSavedShowCorrectAnswers] = useState(
    initialQuizView.config.showCorrectAnswers,
  );
  const [allowLate, setAllowLate] = useState(initialQuizView.config.allowLate);
  const [savedAllowLate, setSavedAllowLate] = useState(initialQuizView.config.allowLate);

  const isSettingsDirty =
    dueLocal !== savedDueLocal ||
    hasTimeLimit !== savedHasTimeLimit ||
    (hasTimeLimit && timeLimitMinutes !== savedTimeLimitMinutes) ||
    shuffleQuestions !== savedShuffleQuestions ||
    autoReleaseGrade !== savedAutoReleaseGrade ||
    showCorrectAnswers !== savedShowCorrectAnswers ||
    allowLate !== savedAllowLate;

  const [addingKind, setAddingKind] = useState<QuestionKind | ''>('');
  const [addCount, setAddCount] = useState('5');
  const [addProgress, setAddProgress] = useState<string | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [aiGenOpen, setAiGenOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

  // ---- Sync with server data without clobbering in-progress edits ----
  const actSig = activitySignature(activity);
  const cfgSig = quizConfigSignature(initialQuizView);
  const lastActSig = useRef(actSig);
  const lastCfgSig = useRef(cfgSig);
  const titleEditingRef = useRef(titleEditing);
  const descEditingRef = useRef(descEditing);
  const isDescDirtyRef = useRef(isDescDirty);
  const isSettingsDirtyRef = useRef(isSettingsDirty);
  titleEditingRef.current = titleEditing;
  descEditingRef.current = descEditing;
  isDescDirtyRef.current = isDescDirty;
  isSettingsDirtyRef.current = isSettingsDirty;

  useEffect(() => {
    if (actSig !== lastActSig.current) {
      lastActSig.current = actSig;
      if (!titleEditingRef.current) setTitleDraft(activity.title);
      setSavedInstructions(activity.instructions);
      if (!descEditingRef.current && !isDescDirtyRef.current) {
        setInstructions(activity.instructions);
      }
      setSavedDueLocal(isoToLocal(activity.dueAt));
      if (!isSettingsDirtyRef.current) {
        setDueLocal(isoToLocal(activity.dueAt));
      }
    }
    if (cfgSig !== lastCfgSig.current) {
      lastCfgSig.current = cfgSig;
      setSavedHasTimeLimit(initialQuizView.config.timeLimitMinutes !== null);
      setSavedTimeLimitMinutes(String(initialQuizView.config.timeLimitMinutes ?? 30));
      setSavedShuffleQuestions(initialQuizView.config.shuffleQuestions);
      setSavedAutoReleaseGrade(initialQuizView.config.autoReleaseGrade);
      setSavedShowCorrectAnswers(initialQuizView.config.showCorrectAnswers);
      setSavedAllowLate(initialQuizView.config.allowLate);
      if (!isSettingsDirtyRef.current) {
        setHasTimeLimit(initialQuizView.config.timeLimitMinutes !== null);
        setTimeLimitMinutes(String(initialQuizView.config.timeLimitMinutes ?? 30));
        setShuffleQuestions(initialQuizView.config.shuffleQuestions);
        setAutoReleaseGrade(initialQuizView.config.autoReleaseGrade);
        setShowCorrectAnswers(initialQuizView.config.showCorrectAnswers);
        setAllowLate(initialQuizView.config.allowLate);
      }
      setQuizView(initialQuizView);
    }
  }, [actSig, cfgSig, activity, initialQuizView]);

  const refetchQuizView = useCallback(async () => {
    try {
      const next = await getTeacherQuizView(activity.id);
      setQuizView(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh quiz.');
    }
  }, [activity.id]);

  // ---- Settings validation (shared by inline save and top buttons) ----
  function prepareSettings(): PreparedSettings {
    const empty = { activityPatch: {}, configPatch: {} };
    if (!isSettingsDirty) return { error: null, ...empty };
    if (!dueLocal) return { error: 'Due date is required.', ...empty };

    let timeLimitToSend: number | null = null;
    if (hasTimeLimit) {
      const n = Number(timeLimitMinutes);
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        return { error: 'Time limit must be a positive whole number of minutes.', ...empty };
      }
      timeLimitToSend = n;
    }

    const activityPatch: Record<string, unknown> = {};
    if (dueLocal !== savedDueLocal) activityPatch.dueAt = localToIso(dueLocal);
    if (allowLate !== savedAllowLate) activityPatch.allowLate = allowLate;

    const configPatch: Record<string, unknown> = {};
    if (hasTimeLimit !== savedHasTimeLimit || (hasTimeLimit && timeLimitMinutes !== savedTimeLimitMinutes)) {
      configPatch.timeLimitMinutes = timeLimitToSend;
    }
    if (shuffleQuestions !== savedShuffleQuestions) configPatch.shuffleQuestions = shuffleQuestions;
    if (autoReleaseGrade !== savedAutoReleaseGrade) configPatch.autoReleaseGrade = autoReleaseGrade;
    if (showCorrectAnswers !== savedShowCorrectAnswers) configPatch.showCorrectAnswers = showCorrectAnswers;
    if (allowLate !== savedAllowLate) configPatch.allowLate = allowLate;

    return { error: null, activityPatch, configPatch };
  }

  async function applySettings(p: PreparedSettings) {
    if (Object.keys(p.activityPatch).length > 0) {
      await updateActivity(activity.id, p.activityPatch);
    }
    if (Object.keys(p.configPatch).length > 0) {
      await updateQuizConfig(activity.id, p.configPatch);
    }
    setSavedDueLocal(dueLocal);
    setSavedHasTimeLimit(hasTimeLimit);
    setSavedTimeLimitMinutes(timeLimitMinutes);
    setSavedShuffleQuestions(shuffleQuestions);
    setSavedAutoReleaseGrade(autoReleaseGrade);
    setSavedShowCorrectAnswers(showCorrectAnswers);
    setSavedAllowLate(allowLate);
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

  function handleSaveDescription() {
    setError(null);
    startTransition(async () => {
      try {
        await updateActivity(activity.id, { instructions });
        setSavedInstructions(instructions);
        setDescEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save instructions.');
      }
    });
  }

  function handleCancelDescription() {
    setInstructions(savedInstructions);
    setDescEditing(false);
  }

  function handleSaveSettings() {
    setError(null);
    const prepared = prepareSettings();
    if (prepared.error) {
      setError(prepared.error);
      return;
    }
    startTransition(async () => {
      try {
        await applySettings(prepared);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save settings.');
      }
    });
  }

  function handleCancelSettings() {
    setDueLocal(savedDueLocal);
    setHasTimeLimit(savedHasTimeLimit);
    setTimeLimitMinutes(savedTimeLimitMinutes);
    setShuffleQuestions(savedShuffleQuestions);
    setAutoReleaseGrade(savedAutoReleaseGrade);
    setShowCorrectAnswers(savedShowCorrectAnswers);
    setAllowLate(savedAllowLate);
  }

  // Top buttons: save everything (and maybe publish), then back to Activities.
  function handleFinish(action: FinishAction) {
    setError(null);
    if (action === 'publish' && !activity.published && quizView.questions.length === 0) {
      setError('Add at least one question before publishing.');
      setTab('edit');
      return;
    }
    const prepared = prepareSettings();
    if (prepared.error) {
      setError(prepared.error);
      setTab('edit');
      return;
    }
    setFinishing(action);
    startFinishing(async () => {
      try {
        if (isDescDirty) {
          await updateActivity(activity.id, { instructions });
          setSavedInstructions(instructions);
        }
        setDescEditing(false);
        await applySettings(prepared);
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

  function addQuestions(kind: QuestionKind, count: number) {
    const n = Math.min(MAX_BULK_ITEMS, Math.max(1, count));
    setError(null);
    const startIndex = quizView.questions.length;
    startTransition(async () => {
      let created = 0;
      try {
        // One at a time so each gets the next display_order
        for (let i = 0; i < n; i++) {
          setAddProgress(n > 1 ? `Adding ${i + 1} of ${n}…` : 'Adding…');
          await createQuizQuestion({ activityId: activity.id, questionKind: kind });
          created++;
        }
        setAddingKind('');
        setAddCount('5');
      } catch (e) {
        setError(
          (e instanceof Error ? e.message : 'Failed to add questions.') +
            (created > 0 ? ` (${created} of ${n} were added)` : ''),
        );
      } finally {
        setAddProgress(null);
        await refetchQuizView();
        router.refresh();
        if (created > 0) setEditIndex(startIndex);
      }
    });
  }

  function handleAddQuestion() {
    if (!addingKind) return;
    addQuestions(addingKind, Number(addCount) || 1);
  }

  const totalPoints = quizView.questions.reduce((acc, q) => acc + q.points, 0);

  // Consecutive questions of the same kind form one "Test" part.
  const testParts: {
    kind: QuestionKind;
    items: { q: (typeof quizView.questions)[number]; index: number }[];
    points: number;
  }[] = [];
  quizView.questions.forEach((q, index) => {
    const last = testParts[testParts.length - 1];
    if (last && last.kind === q.questionKind) {
      last.items.push({ q, index });
      last.points += q.points;
    } else {
      testParts.push({ kind: q.questionKind, items: [{ q, index }], points: q.points });
    }
  });
  const questionCount = quizView.questions.length;
  const locked = quizView.questionsLocked;

  // Summaries for the folded settings rows
  const timingSummary = `${hasTimeLimit ? `${timeLimitMinutes || '?'} min` : 'No time limit'} · ${
    allowLate ? 'late ok' : 'late off'
  }`;
  const resultsSummary = [
    shuffleQuestions ? 'Shuffled' : 'In order',
    autoReleaseGrade ? 'auto-release' : 'manual release',
  ].join(' · ');

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
            <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
              Quiz
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
            {questionCount > 0 && (
              <span className="text-xs text-zinc-500">
                {questionCount} question{questionCount === 1 ? '' : 's'} · {totalPoints} pts
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
          deleteLabel="Delete quiz"
        />
      </div>

      <EditorTabs
        tabs={[
          { key: 'edit', label: 'Edit' },
          { key: 'attempts', label: 'Attempts', count: quizView.attemptCount },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'attempts' ? (
        <QuizAttemptsPanel
          activityId={activity.id}
          classId={classId}
          quizTotalPoints={Number(quizView.config.quizTotalPoints ?? totalPoints)}
          initialAttempts={initialAttempts}
        />
      ) : (
        <>
          {locked && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="font-semibold">Questions are locked</p>
                <p className="mt-0.5 text-xs text-amber-800">
                  A student has already started this quiz. You can still edit the title, instructions,
                  due date and settings, but not the questions.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
            {/* LEFT: one content card */}
            <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] lg:col-span-2">
              {/* Instructions */}
              <div className="p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[15px] font-bold text-zinc-900">Instructions</h2>
                  {descEditing && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className={isDescDirty ? 'text-amber-600' : 'text-zinc-400'}>
                        {isDescDirty ? 'Unsaved changes' : 'No changes'}
                      </span>
                      <button
                        type="button"
                        onClick={handleCancelDescription}
                        disabled={busy}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveDescription}
                        disabled={busy || !isDescDirty}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Save
                      </button>
                    </div>
                  )}
                </div>

                {descEditing ? (
                  <MarkdownEditor
                    value={instructions}
                    onChange={setInstructions}
                    placeholder="e.g. 'Answer all items. You have one attempt. Read each question carefully.'"
                    rows={6}
                    disabled={busy}
                  />
                ) : savedInstructions.trim() ? (
                  <button
                    type="button"
                    onClick={() => setDescEditing(true)}
                    className="block w-full cursor-text rounded-lg px-2 py-2 text-left transition hover:bg-zinc-50"
                    aria-label="Edit instructions"
                  >
                    <MarkdownContent body={savedInstructions} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDescEditing(true)}
                    className="flex w-full items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-left text-sm font-medium text-zinc-600 transition hover:border-red-300 hover:bg-red-50/40 hover:text-red-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add instructions
                  </button>
                )}
              </div>

              {/* Questions */}
              <div className="border-t border-zinc-100 p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[15px] font-bold text-zinc-900">Questions</h2>
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => setAiGenOpen(true)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Generate with AI
                    </button>
                  )}
                </div>

                {questionCount > 0 && (
                  <div className="mb-5 space-y-5">
                    {testParts.map((part, pi) => {
                      const isLastPart = pi === testParts.length - 1;
                      const label = QUESTION_KIND_LABELS[part.kind];
                      return (
                        <div key={`${part.kind}-${pi}`}>
                          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-100 pb-1.5">
                            <h3 className="text-sm font-bold text-zinc-900">
                              Test {toRoman(pi + 1)} – {label}
                            </h3>
                            <span className="text-xs text-zinc-500">
                              {part.items.length} item{part.items.length === 1 ? '' : 's'} · {part.points} pt
                              {part.points === 1 ? '' : 's'}
                            </span>
                          </div>
                          <ul className="space-y-2">
                            {part.items.map(({ q, index }) => (
                              <li key={q.id}>
                                <QuestionRow
                                  question={q}
                                  index={index}
                                  locked={locked}
                                  onOpen={() => setEditIndex(index)}
                                  onChanged={refetchQuizView}
                                  onError={setError}
                                />
                              </li>
                            ))}
                          </ul>
                          {isLastPart && !locked && (
                            <button
                              type="button"
                              onClick={() => addQuestions(part.kind, 1)}
                              disabled={busy}
                              className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add 1 more {label.toLowerCase()}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!locked && (
                  <div className="rounded-xl border border-dashed border-zinc-300 p-3">
                    <p className="mb-2 text-xs font-semibold text-zinc-700">
                      {questionCount === 0 ? 'Add your first questions' : 'Add another test part'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor="quiz-add-kind" className="sr-only">
                        Question type
                      </label>
                      <select
                        id="quiz-add-kind"
                        value={addingKind}
                        onChange={(e) => setAddingKind(e.target.value as QuestionKind | '')}
                        disabled={busy}
                        className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10 disabled:opacity-60"
                      >
                        <option value="">Question type…</option>
                        {QUESTION_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {QUESTION_KIND_LABELS[k]}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1.5">
                        <label htmlFor="quiz-add-count" className="sr-only">
                          Number of items
                        </label>
                        <input
                          id="quiz-add-count"
                          type="text"
                          inputMode="numeric"
                          maxLength={2}
                          value={addCount}
                          onChange={(e) => setAddCount(e.target.value.replace(/\D/g, ''))}
                          disabled={busy}
                          className="w-14 rounded-xl border border-zinc-200 bg-white px-2 py-2 text-center text-sm focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10 disabled:opacity-60"
                        />
                        <span className="text-sm text-zinc-600">items</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddQuestion}
                        disabled={
                          busy || !addingKind || !(Number(addCount) >= 1 && Number(addCount) <= MAX_BULK_ITEMS)
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isPending && addProgress ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        {addProgress ?? 'Add items'}
                      </button>
                    </div>
                    <p className="mt-1.5 text-xs text-zinc-500">
                      Creates blank items of that type (1–{MAX_BULK_ITEMS}) for you to fill in.
                    </p>
                  </div>
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
                    <label htmlFor="quiz-due" className={editorLabelClass}>
                      Due
                    </label>
                    <input
                      id="quiz-due"
                      type="datetime-local"
                      value={dueLocal}
                      onChange={(e) => setDueLocal(e.target.value)}
                      disabled={busy}
                      className={editorInputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="quiz-term" className={editorLabelClass}>
                      Term
                    </label>
                    <select
                      id="quiz-term"
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
                </div>

                {/* Folded rows */}
                <SettingsDisclosure title="Timing" summary={timingSummary}>
                  <div>
                    <label className="flex items-start gap-2 text-sm text-zinc-700">
                      <input
                        type="checkbox"
                        checked={hasTimeLimit}
                        onChange={(e) => setHasTimeLimit(e.target.checked)}
                        disabled={busy}
                        className={editorCheckboxClass}
                      />
                      Time limit
                    </label>
                    {hasTimeLimit ? (
                      <div className="ml-6 mt-2 flex items-center gap-2">
                        <label htmlFor="quiz-minutes" className="sr-only">
                          Minutes
                        </label>
                        <input
                          id="quiz-minutes"
                          type="text"
                          inputMode="numeric"
                          maxLength={3}
                          value={timeLimitMinutes}
                          onChange={(e) => setTimeLimitMinutes(e.target.value.replace(/\D/g, ''))}
                          disabled={busy}
                          className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-sm focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10 disabled:opacity-60"
                        />
                        <span className="text-sm text-zinc-600">minutes · auto-submits</span>
                      </div>
                    ) : (
                      <p className="ml-6 mt-1 text-xs text-zinc-500">Students finish at their own pace.</p>
                    )}
                  </div>
                  <label className="flex items-start gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={allowLate}
                      onChange={(e) => setAllowLate(e.target.checked)}
                      disabled={busy}
                      className={editorCheckboxClass}
                    />
                    <span>
                      Allow late submissions
                      <span className="block text-xs text-zinc-500">Late attempts are flagged.</span>
                    </span>
                  </label>
                </SettingsDisclosure>

                <SettingsDisclosure title="Results and order" summary={resultsSummary}>
                  <label className="flex items-start gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={shuffleQuestions}
                      onChange={(e) => setShuffleQuestions(e.target.checked)}
                      disabled={busy}
                      className={editorCheckboxClass}
                    />
                    <span>
                      Shuffle question order
                      <span className="block text-xs text-zinc-500">Each student sees a different order.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={autoReleaseGrade}
                      onChange={(e) => setAutoReleaseGrade(e.target.checked)}
                      disabled={busy}
                      className={editorCheckboxClass}
                    />
                    <span>
                      Auto-release grades
                      <span className="block text-xs text-zinc-500">Students see their score right after submitting.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={showCorrectAnswers}
                      onChange={(e) => setShowCorrectAnswers(e.target.checked)}
                      disabled={busy}
                      className={editorCheckboxClass}
                    />
                    <span>
                      Show correct answers
                      <span className="block text-xs text-zinc-500">Revealed on the review screen after submitting.</span>
                    </span>
                  </label>
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
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete quiz?"
        message={`"${activity.title}" and all questions, attempts, and student responses will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />

      <ConfirmDialog
        open={confirmUnpublish}
        title="Unpublish this quiz?"
        message="Students will no longer see it in their activities list. Existing attempts and grades are kept."
        confirmLabel="Unpublish"
        onConfirm={handleConfirmUnpublish}
        onClose={() => setConfirmUnpublish(false)}
      />

      <QuestionEditModal
        questions={quizView.questions}
        index={editIndex}
        locked={locked}
        onIndexChange={setEditIndex}
        onClose={() => setEditIndex(null)}
        onChanged={refetchQuizView}
      />

      <AIQuizGenerator
        open={aiGenOpen}
        onClose={() => setAiGenOpen(false)}
        activityId={activity.id}
        classId={classId}
        onGenerated={() => {
          refetchQuizView();
          router.refresh();
        }}
      />
    </div>
  );
}