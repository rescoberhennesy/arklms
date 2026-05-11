'use client';

import { useState, useTransition, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  Plus,
  Lock,
  Timer,
  Shuffle,
  CheckCircle2,
  ListChecks,
} from 'lucide-react';
import MarkdownEditor from '@/components/dashboard/MarkdownEditor';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import QuestionEditor from '@/components/teacher/QuestionEditor';
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

interface QuizEditorProps {
  activity: ActivityWithAllSubmissions;
  classId: string;
  initialQuizView: TeacherQuizView;
  initialAttempts: QuizAttemptListItem[];
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
  ].join('§');
}

export default function QuizEditor({
  activity,
  classId,
  initialQuizView,
  initialAttempts,
}: QuizEditorProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Quiz view (questions + config + lock state). Resyncable from server.
  const [quizView, setQuizView] = useState<TeacherQuizView>(initialQuizView);

  // Title (inline editor)
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(activity.title);

  // Instructions (manual-save, dirty-aware)
  const [instructions, setInstructions] = useState(activity.instructions);
  const [savedInstructions, setSavedInstructions] = useState(activity.instructions);
  const [descEditing, setDescEditing] = useState(false);
  const isDescDirty = instructions !== savedInstructions;

  // Quiz settings (manual-save dirty-aware)
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

  const isSettingsDirty =
    dueLocal !== savedDueLocal ||
    hasTimeLimit !== savedHasTimeLimit ||
    (hasTimeLimit && timeLimitMinutes !== savedTimeLimitMinutes) ||
    shuffleQuestions !== savedShuffleQuestions ||
    autoReleaseGrade !== savedAutoReleaseGrade ||
    showCorrectAnswers !== savedShowCorrectAnswers;

  // Add-question UI
  const [addingKind, setAddingKind] = useState<QuestionKind | ''>('');

  // Confirms
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

  // Prop-sync
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
      if (!isSettingsDirtyRef.current) {
        setHasTimeLimit(initialQuizView.config.timeLimitMinutes !== null);
        setTimeLimitMinutes(
          String(initialQuizView.config.timeLimitMinutes ?? 30),
        );
        setShuffleQuestions(initialQuizView.config.shuffleQuestions);
        setAutoReleaseGrade(initialQuizView.config.autoReleaseGrade);
        setShowCorrectAnswers(initialQuizView.config.showCorrectAnswers);
      }
      // Always resync the questions list + lock + count from server fetch
      setQuizView(initialQuizView);
    }
  }, [actSig, cfgSig, activity, initialQuizView]);

  // ---- Refresh quiz view (after question CRUD) ----
  const refetchQuizView = useCallback(async () => {
    try {
      const next = await getTeacherQuizView(activity.id);
      setQuizView(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh quiz.');
    }
  }, [activity.id]);

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
        // Activity-level fields go through updateActivity
        if (dueLocal !== savedDueLocal) {
          await updateActivity(activity.id, { dueAt: dueIso });
        }
        // Quiz-config fields go through updateQuizConfig
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
        if (Object.keys(configPatch).length > 0) {
          await updateQuizConfig(activity.id, configPatch);
        }

        setSavedDueLocal(dueLocal);
        setSavedHasTimeLimit(hasTimeLimit);
        setSavedTimeLimitMinutes(timeLimitMinutes);
        setSavedShuffleQuestions(shuffleQuestions);
        setSavedAutoReleaseGrade(autoReleaseGrade);
        setSavedShowCorrectAnswers(showCorrectAnswers);
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

  function handleAddQuestion() {
    if (!addingKind) return;
    const kind = addingKind;
    setError(null);
    startTransition(async () => {
      try {
        await createQuizQuestion({
          activityId: activity.id,
          questionKind: kind,
        });
        setAddingKind('');
        await refetchQuizView();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to add question.');
      }
    });
  }

  // ---- Render ----

  const totalPoints = quizView.questions.reduce((acc, q) => acc + q.points, 0);
  const questionCount = quizView.questions.length;
  const locked = quizView.questionsLocked;

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
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                Quiz
              </span>
              <h1 className="text-2xl font-bold text-gray-900">
                {activity.title}
              </h1>
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

      {/* Quick stats strip */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Due {new Date(activity.dueAt).toLocaleString()}
        </span>
        <span className="inline-flex items-center gap-1">
          <Award className="h-3 w-3" />
          {totalPoints} pts total
        </span>
        <span className="inline-flex items-center gap-1">
          <ListChecks className="h-3 w-3" />
          {questionCount} question{questionCount === 1 ? '' : 's'}
        </span>
        {quizView.config.timeLimitMinutes !== null && (
          <span className="inline-flex items-center gap-1">
            <Timer className="h-3 w-3" />
            {quizView.config.timeLimitMinutes} min
          </span>
        )}
        {quizView.attemptCount > 0 && (
          <span>
            {quizView.attemptCount} attempt
            {quizView.attemptCount === 1 ? '' : 's'} so far
          </span>
        )}
      </div>

      {/* Lock banner */}
      {locked && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-medium">Questions are locked</p>
            <p className="mt-0.5 text-xs text-amber-800">
              At least one student has started an attempt. You can still
              edit the title, description, due date, and time limit, but
              the questions themselves are now read-only.
            </p>
          </div>
        </div>
      )}

      {/* Description */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Instructions
          </h2>
          {descEditing ? (
            <div className="flex items-center gap-2 text-xs">
              {isDescDirty ? (
                <span className="text-amber-600">Unsaved changes</span>
              ) : (
                <span className="text-gray-400">No changes</span>
              )}
              <button
                type="button"
                onClick={handleCancelDescription}
                disabled={isPending}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDescription}
                disabled={isPending || !isDescDirty}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Save
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDescEditing(true)}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Edit instructions"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {descEditing ? (
          <MarkdownEditor
            value={instructions}
            onChange={setInstructions}
            placeholder="Instructions students see before starting the quiz. Markdown supported."
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

      {/* Quiz settings */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Quiz settings
          </h2>
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
                {isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Save
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
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

          <div className="md:col-span-2 rounded-md border border-gray-200 p-3">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={hasTimeLimit}
                onChange={(e) => setHasTimeLimit(e.target.checked)}
                disabled={isPending}
                className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <Timer className="h-4 w-4 text-gray-500" />
              Enforce time limit
            </label>
            {hasTimeLimit && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={timeLimitMinutes}
                  onChange={(e) => setTimeLimitMinutes(e.target.value)}
                  disabled={isPending}
                  className="w-24 rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
                />
                <span className="text-sm text-gray-600">minutes</span>
              </div>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Auto-submit when the timer reaches zero. Server enforces the
              deadline regardless of client clock.
            </p>
          </div>

          <label className="inline-flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={shuffleQuestions}
              onChange={(e) => setShuffleQuestions(e.target.checked)}
              disabled={isPending}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span>
              <span className="inline-flex items-center gap-1 font-medium">
                <Shuffle className="h-3.5 w-3.5 text-gray-500" />
                Shuffle question order
              </span>
              <span className="block text-xs text-gray-500">
                Each student sees a different question order.
              </span>
            </span>
          </label>

          <label className="inline-flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={autoReleaseGrade}
              onChange={(e) => setAutoReleaseGrade(e.target.checked)}
              disabled={isPending}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span>
              <span className="inline-flex items-center gap-1 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-gray-500" />
                Release grade automatically
              </span>
              <span className="block text-xs text-gray-500">
                Students see their score immediately after submitting.
                Useful for fully auto-graded quizzes.
              </span>
            </span>
          </label>

          <label className="md:col-span-2 inline-flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showCorrectAnswers}
              onChange={(e) => setShowCorrectAnswers(e.target.checked)}
              disabled={isPending}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span>
              <span className="font-medium">
                Show correct answers after submission
              </span>
              <span className="block text-xs text-gray-500">
                Reveals correct answers on the post-submission review screen.
              </span>
            </span>
          </label>
        </div>
      </section>

      {/* Questions */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Questions
          </h2>
        </div>

        {quizView.questions.length === 0 ? (
          <p className="text-sm italic text-gray-400">
            No questions yet. Add one below.
          </p>
        ) : (
          <ul className="space-y-3">
            {quizView.questions.map((q, idx) => (
              <li key={q.id}>
                <QuestionEditor
                  question={q}
                  index={idx}
                  locked={locked}
                  onChanged={refetchQuizView}
                  onError={setError}
                />
              </li>
            ))}
          </ul>
        )}

        {!locked && (
          <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3">
            <select
              value={addingKind}
              onChange={(e) =>
                setAddingKind(e.target.value as QuestionKind | '')
              }
              disabled={isPending}
              className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
            >
              <option value="">Choose a question type…</option>
              {QUESTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {QUESTION_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddQuestion}
              disabled={isPending || !addingKind}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add question
            </button>
          </div>
        )}
      </section>

      {/* Attempts (C7 Slice A) */}
      <QuizAttemptsPanel
        activityId={activity.id}
        classId={classId}
        quizTotalPoints={Number(quizView.config.quizTotalPoints ?? totalPoints)}
        initialAttempts={initialAttempts}
      />

      {/* Danger zone */}
      <section className="rounded-xl border border-red-200 bg-red-50/30 p-4">
        <h2 className="text-sm font-semibold text-red-900">Danger zone</h2>
        <p className="mt-1 text-xs text-red-700">
          Deleting this quiz is permanent. All questions, attempts, and
          responses will be removed.
        </p>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete quiz
        </button>
      </section>

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
    </div>
  );
}