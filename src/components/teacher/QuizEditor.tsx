'use client';

import { useState, useTransition, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Pencil,
  Trash2,
  Save,
  Loader2,
  Eye,
  EyeOff,
  Plus,
  Lock,
  Sparkles,
} from 'lucide-react';
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
import {
  type ActivityWithAllSubmissions,
} from '@/lib/types/activities';
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

interface QuizEditorProps {
  activity: ActivityWithAllSubmissions;
  classId: string;
  initialQuizView: TeacherQuizView;
  initialAttempts: QuizAttemptListItem[];
  initialAttachments: ActivityAttachment[];
}

const TERM_ACCENTS: Record<ModuleTerm, string> = {
  prelim: 'border-blue-200 text-blue-800 bg-blue-50',
  midterm: 'border-purple-200 text-purple-800 bg-purple-50',
  prefinal: 'border-amber-200 text-amber-800 bg-amber-50',
  final: 'border-rose-200 text-rose-800 bg-rose-50',
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
  return [
    a.id,
    a.title,
    a.term,
    a.instructions,
    a.dueAt,
    a.published ? 1 : 0,
  ].join('§');
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [quizView, setQuizView] = useState<TeacherQuizView>(initialQuizView);

  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(activity.title);

  const [instructions, setInstructions] = useState(activity.instructions);
  const [savedInstructions, setSavedInstructions] = useState(activity.instructions);
  const [descEditing, setDescEditing] = useState(false);
  const isDescDirty = instructions !== savedInstructions;

  const [dueLocal, setDueLocal] = useState(isoToLocal(activity.dueAt));
  const [savedDueLocal, setSavedDueLocal] = useState(isoToLocal(activity.dueAt));

  const [hasTimeLimit, setHasTimeLimit] = useState(
    initialQuizView.config.timeLimitMinutes !== null,
  );
  const [savedHasTimeLimit, setSavedHasTimeLimit] = useState(
    initialQuizView.config.timeLimitMinutes !== null,
  );
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(
    String(initialQuizView.config.timeLimitMinutes ?? 30),
  );
  const [savedTimeLimitMinutes, setSavedTimeLimitMinutes] = useState(
    String(initialQuizView.config.timeLimitMinutes ?? 30),
  );

  const [shuffleQuestions, setShuffleQuestions] = useState(
    initialQuizView.config.shuffleQuestions,
  );
  const [savedShuffleQuestions, setSavedShuffleQuestions] = useState(
    initialQuizView.config.shuffleQuestions,
  );
  const [autoReleaseGrade, setAutoReleaseGrade] = useState(
    initialQuizView.config.autoReleaseGrade,
  );
  const [savedAutoReleaseGrade, setSavedAutoReleaseGrade] = useState(
    initialQuizView.config.autoReleaseGrade,
  );
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(
    initialQuizView.config.showCorrectAnswers,
  );
  const [savedShowCorrectAnswers, setSavedShowCorrectAnswers] = useState(
    initialQuizView.config.showCorrectAnswers,
  );

  // NEW: allow_late for quizzes
  const [allowLate, setAllowLate] = useState(initialQuizView.config.allowLate);
  const [savedAllowLate, setSavedAllowLate] = useState(
    initialQuizView.config.allowLate,
  );

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
      setSavedTimeLimitMinutes(
        String(initialQuizView.config.timeLimitMinutes ?? 30),
      );
      setSavedShuffleQuestions(initialQuizView.config.shuffleQuestions);
      setSavedAutoReleaseGrade(initialQuizView.config.autoReleaseGrade);
      setSavedShowCorrectAnswers(initialQuizView.config.showCorrectAnswers);
      setSavedAllowLate(initialQuizView.config.allowLate);
      if (!isSettingsDirtyRef.current) {
        setHasTimeLimit(initialQuizView.config.timeLimitMinutes !== null);
        setTimeLimitMinutes(
          String(initialQuizView.config.timeLimitMinutes ?? 30),
        );
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
        setError(e instanceof Error ? e.message : 'Failed to save description.');
      }
    });
  }

  function handleCancelDescription() {
    setInstructions(savedInstructions);
    setDescEditing(false);
  }

  function handleSaveSettings() {
    setError(null);
    if (!dueLocal) {
      setError('Due date is required.');
      return;
    }
    const dueIso = localToIso(dueLocal);
    let timeLimitToSend: number | null = null;
    if (hasTimeLimit) {
      const n = Number(timeLimitMinutes);
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        setError('Time limit must be a positive whole number of minutes.');
        return;
      }
      timeLimitToSend = n;
    }
    startTransition(async () => {
      try {
        // Push due_at + allow_late through updateActivity (assignment-level),
        // and the quiz-specific config (timer, shuffle, etc.) through
        // updateQuizConfig.
        const activityPatch: Record<string, unknown> = {};
        if (dueLocal !== savedDueLocal) activityPatch.dueAt = dueIso;
        if (allowLate !== savedAllowLate) activityPatch.allowLate = allowLate;
        if (Object.keys(activityPatch).length > 0) {
          await updateActivity(activity.id, activityPatch);
        }

        const configPatch: Record<string, unknown> = {};
        if (
          hasTimeLimit !== savedHasTimeLimit ||
          (hasTimeLimit && timeLimitMinutes !== savedTimeLimitMinutes)
        ) {
          configPatch.timeLimitMinutes = timeLimitToSend;
        }
        if (shuffleQuestions !== savedShuffleQuestions) {
          configPatch.shuffleQuestions = shuffleQuestions;
        }
        if (autoReleaseGrade !== savedAutoReleaseGrade) {
          configPatch.autoReleaseGrade = autoReleaseGrade;
        }
        if (showCorrectAnswers !== savedShowCorrectAnswers) {
          configPatch.showCorrectAnswers = showCorrectAnswers;
        }
        if (allowLate !== savedAllowLate) {
          configPatch.allowLate = allowLate;
        }
        if (Object.keys(configPatch).length > 0) {
          await updateQuizConfig(activity.id, configPatch);
        }
        setSavedDueLocal(dueLocal);
        setSavedHasTimeLimit(hasTimeLimit);
        setSavedTimeLimitMinutes(timeLimitMinutes);
        setSavedShuffleQuestions(shuffleQuestions);
        setSavedAutoReleaseGrade(autoReleaseGrade);
        setSavedShowCorrectAnswers(showCorrectAnswers);
        setSavedAllowLate(allowLate);
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

  function handleTogglePublish() {
    if (activity.published) {
      setConfirmUnpublish(true);
      return;
    }
    if (quizView.questions.length === 0) {
      setError('Add at least one question before publishing.');
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
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-blue-700">
              Quiz
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
            Due {dueShort} · {questionCount} question{questionCount === 1 ? '' : 's'} ·{' '}
            {totalPoints} points
            {quizView.config.timeLimitMinutes !== null &&
              ` · ${quizView.config.timeLimitMinutes} min limit`}
            {quizView.config.allowLate && ' · late allowed'}
            {quizView.attemptCount > 0 &&
              ` · ${quizView.attemptCount} attempt${quizView.attemptCount === 1 ? '' : 's'} so far`}
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

      {locked && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-semibold">Questions are locked</p>
            <p className="mt-0.5 text-xs text-amber-800">
              A student has already started this quiz. You can still edit the
              title, instructions, due date and settings, but not the questions.
            </p>
          </div>
        </div>
      )}

      {/* ============================== TWO COLUMNS ============================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LEFT */}
        <div className="space-y-6 lg:col-span-2">
          {/* Instructions */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-bold text-gray-900">Instructions</h2>
                <p className="text-xs text-gray-500">What students read before starting the quiz.</p>
              </div>
              {descEditing && (
                <div className="flex items-center gap-2 text-xs">
                  <span className={isDescDirty ? 'text-amber-600' : 'text-gray-400'}>
                    {isDescDirty ? 'Unsaved changes' : 'No changes'}
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelDescription}
                    disabled={isPending}
                    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDescription}
                    disabled={isPending || !isDescDirty}
                    className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
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
                disabled={isPending}
              />
            ) : savedInstructions.trim() ? (
              <button
                type="button"
                onClick={() => setDescEditing(true)}
                className="block w-full cursor-text rounded-lg px-2 py-2 text-left transition hover:bg-gray-50"
                aria-label="Edit instructions"
              >
                <MarkdownContent body={savedInstructions} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setDescEditing(true)}
                className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-4 py-3 text-left text-sm text-gray-600 hover:border-red-300 hover:bg-red-50/40"
              >
                <Plus className="h-4 w-4" />
                Add instructions
              </button>
            )}
          </section>

          {/* Questions */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-bold text-gray-900">Questions</h2>
                <p className="text-xs text-gray-500">
                  {questionCount === 0
                    ? 'Add questions manually or generate them with AI.'
                    : `${questionCount} question${questionCount === 1 ? '' : 's'} · ${totalPoints} points total`}
                </p>
              </div>
              {!locked && (
                <button
                  type="button"
                  onClick={() => setAiGenOpen(true)}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Generate with AI
                </button>
              )}
            </div>

                        {questionCount === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-4 py-6 text-center text-sm text-gray-500">
                No questions yet. Choose a type and how many items below, or use{' '}
                <span className="font-semibold text-purple-700">Generate with AI</span>.
              </div>
            ) : (
              <div className="space-y-5">
                {testParts.map((part, pi) => {
                  const isLastPart = pi === testParts.length - 1;
                  const label = QUESTION_KIND_LABELS[part.kind];
                  return (
                    <div key={`${part.kind}-${pi}`}>
                      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 pb-1.5">
                        <h3 className="text-sm font-bold text-gray-900">
                          Test {toRoman(pi + 1)} – {label}
                        </h3>
                        <span className="text-xs text-gray-500">
                          {part.items.length} item{part.items.length === 1 ? '' : 's'} ·{' '}
                          {part.points} pt{part.points === 1 ? '' : 's'}
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
                      {/* Only the last part can grow in place (new items go at the end) */}
                      {isLastPart && !locked && (
                        <button
                          type="button"
                          onClick={() => addQuestions(part.kind, 1)}
                          disabled={isPending}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
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
              <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                <p className="mb-2 text-xs font-semibold text-gray-700">
                  {questionCount === 0 ? 'Add the first test part' : 'Add a new test part'}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="quiz-add-kind" className="sr-only">
                    Question type
                  </label>
                  <select
                    id="quiz-add-kind"
                    value={addingKind}
                    onChange={(e) => setAddingKind(e.target.value as QuestionKind | '')}
                    disabled={isPending}
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
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
                      disabled={isPending}
                      className="w-14 rounded-lg border border-gray-200 bg-white px-2 py-2 text-center text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
                    />
                    <span className="text-sm text-gray-600">items</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    disabled={
                      isPending ||
                      !addingKind ||
                      !(Number(addCount) >= 1 && Number(addCount) <= MAX_BULK_ITEMS)
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    {addProgress ?? 'Add items'}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                  Creates blank items of that type (1–{MAX_BULK_ITEMS}) for you to fill in.
                </p>
              </div>
            )}
          </section>

          {/* Attachments (unchanged component) */}
          <ActivityAttachmentsPanel
            activityId={activity.id}
            classId={classId}
            initialAttachments={initialAttachments}
            canEdit={true}
          />
        </div>

        {/* RIGHT: Quiz settings */}
        <aside className="lg:col-span-1">
          <section className="sticky top-4 space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold text-gray-900">Quiz settings</h2>
              {isSettingsDirty && <span className="text-xs text-amber-600">Unsaved</span>}
            </div>

            {/* Term (saves immediately) */}
            <div>
              <label htmlFor="quiz-term" className="mb-1 block text-xs font-semibold text-gray-700">
                Term
              </label>
              <select
                id="quiz-term"
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

            <div>
              <label htmlFor="quiz-due" className="mb-1 block text-xs font-semibold text-gray-700">
                Due date
              </label>
              <input
                id="quiz-due"
                type="datetime-local"
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
                disabled={isPending}
                className={inputClass}
              />
            </div>

            {/* Timing */}
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Timing</p>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={hasTimeLimit}
                    onChange={(e) => setHasTimeLimit(e.target.checked)}
                    disabled={isPending}
                    className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
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
                      disabled={isPending}
                      className="w-20 rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
                    />
                    <span className="text-sm text-gray-600">minutes</span>
                  </div>
                ) : (
                  <p className="ml-6 mt-1 text-xs text-gray-500">No timer. Students finish at their own pace.</p>
                )}
                {hasTimeLimit && (
                  <p className="ml-6 mt-1 text-xs text-gray-500">Auto-submits when time runs out.</p>
                )}
              </div>

              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={allowLate}
                  onChange={(e) => setAllowLate(e.target.checked)}
                  disabled={isPending}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span>
                  Allow late submissions
                  <span className="block text-xs text-gray-500">Late attempts are flagged.</span>
                </span>
              </label>
            </div>

            {/* Delivery & results */}
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Questions &amp; results
              </p>

              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                  disabled={isPending}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span>
                  Shuffle question order
                  <span className="block text-xs text-gray-500">Each student sees a different order.</span>
                </span>
              </label>

              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={autoReleaseGrade}
                  onChange={(e) => setAutoReleaseGrade(e.target.checked)}
                  disabled={isPending}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span>
                  Auto-release grades
                  <span className="block text-xs text-gray-500">Students see their score right after submitting.</span>
                </span>
              </label>

              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={showCorrectAnswers}
                  onChange={(e) => setShowCorrectAnswers(e.target.checked)}
                  disabled={isPending}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span>
                  Show correct answers
                  <span className="block text-xs text-gray-500">Revealed on the review screen after submitting.</span>
                </span>
              </label>
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
                <p className="text-sm font-semibold text-red-800">Delete quiz</p>
                <p className="text-xs text-gray-500">Removes all questions, attempts and answers.</p>
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

      {/* Attempts (unchanged) */}
      <QuizAttemptsPanel
        activityId={activity.id}
        classId={classId}
        quizTotalPoints={Number(quizView.config.quizTotalPoints ?? totalPoints)}
        initialAttempts={initialAttempts}
      />

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