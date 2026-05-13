'use client';

import { useState, useEffect, useRef, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Save,
  Loader2,
  Award,
  AlertCircle,
  CheckCircle2,
  Pencil,
  RotateCcw,
  Clock,
  ArrowLeft,
  MessageSquare,
} from 'lucide-react';
import Link from 'next/link';
import MarkdownEditor from '@/components/dashboard/MarkdownEditor';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import StudentAnswerView from '@/components/teacher/StudentAnswerView';
import {
  AISuggestFeedbackProvider,
  AISuggestFeedbackButton,
  AISuggestFeedbackCard,
} from '@/components/teacher/ai/AISuggestFeedback';
import { markAiGenerationPublished } from '@/lib/actions/aiGenerations';
import {
  setManualResponseGrade,
  setAttemptFeedback,
  recomputeQuizScore,
} from '@/lib/actions/quizzes';
import {
  AUTO_GRADED_KINDS,
  MANUAL_ONLY_KINDS,
  type AttemptForGradingView,
  type QuestionKind,
  type QuizQuestion,
  type QuizResponse,
} from '@/lib/types/quizzes';

interface QuizAttemptGraderProps {
  view: AttemptForGradingView;
}

// Per-question editable grade state. Seeded from the response's
// manual_points / feedback if present, else from auto_points (so the
// teacher sees the auto-graded score as the "current" value they can
// override).
interface RowDraft {
  // The points value to write to manual_points on save. Null = "leave
  // as auto", non-null = override (or, for manual-only kinds, the
  // grader's score).
  pointsInput: string;
  feedback: string;
  // True when the teacher has explicitly chosen to override an auto-graded
  // kind. Manual-only kinds (essay) are always in "override mode" since
  // there's no auto value.
  overriding: boolean;
}

function autoPointsFor(response: QuizResponse | null): number | null {
  if (!response) return null;
  return response.autoPoints;
}

function manualPointsFor(response: QuizResponse | null): number | null {
  if (!response) return null;
  return response.manualPoints;
}

// Seed a row's draft from the current response. Manual override wins;
// else auto-graded value; else empty.
function seedDraft(
  question: QuizQuestion,
  response: QuizResponse | null,
): RowDraft {
  const isManualOnly = MANUAL_ONLY_KINDS.has(question.questionKind);
  const manual = manualPointsFor(response);
  const auto = autoPointsFor(response);
  let pointsInput = '';
  if (manual !== null) pointsInput = String(manual);
  else if (!isManualOnly && auto !== null) pointsInput = String(auto);
  return {
    pointsInput,
    feedback: response?.feedback ?? '',
    // Manual-only kinds are always "overriding" (the input is always shown).
    // Auto-graded kinds start in override mode only if there's already a
    // manual_points value saved.
    overriding: isManualOnly || manual !== null,
  };
}

// Cheap signature for prop-sync: detect when the server-fetched view
// actually changed (e.g. after a save + revalidate).
function viewSignature(v: AttemptForGradingView): string {
  return [
    v.attempt.id,
    v.attempt.autoScore ?? '-',
    v.attempt.manualScoreOverride ?? '-',
    v.attempt.feedback,
    v.currentScore,
    v.gradeReleasedAt ?? '-',
    ...v.responses.map(
      (r) =>
        `${r.id}:${r.manualPoints ?? '-'}:${r.autoPoints ?? '-'}:${r.feedback ?? ''}`,
    ),
  ].join('|');
}

export default function QuizAttemptGrader({ view }: QuizAttemptGraderProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Map response id → draft. We index by response id (not question id)
  // because that's what setManualResponseGrade takes. Build the response
  // lookup once for fast access.
  const responseByQuestionId = useMemo(() => {
    const m = new Map<string, QuizResponse>();
    for (const r of view.responses) m.set(r.questionId, r);
    return m;
  }, [view.responses]);

  // Initial drafts, one per question. Questions with no response still get
  // a row (the teacher might want to leave feedback or grant manual points
  // even though the student didn't answer).
  const buildInitialDrafts = (): Record<string, RowDraft> => {
    const out: Record<string, RowDraft> = {};
    for (const q of view.questions) {
      const r = responseByQuestionId.get(q.id) ?? null;
      out[q.id] = seedDraft(q, r);
    }
    return out;
  };

  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(
    buildInitialDrafts,
  );

  // Attempt-level overall feedback. Lives alongside `drafts` but is
  // independent — it writes to quiz_attempts.feedback via setAttemptFeedback,
  // not to any quiz_responses row.
  const [attemptFeedback, setAttemptFeedbackState] = useState<string>(
    view.attempt.feedback,
  );
  const [pendingGenerationId, setPendingGenerationId] = useState<string | null>(
    null,
  );

  // Prop-sync. After a successful save the parent server component re-fetches
  // the view; we adopt the new state unless the teacher is mid-edit.
  const editingRef = useRef(false);
  const lastSigRef = useRef(viewSignature(view));
  useEffect(() => {
    const sig = viewSignature(view);
    if (sig !== lastSigRef.current) {
      lastSigRef.current = sig;
      if (!editingRef.current) {
        setDrafts(buildInitialDrafts());
        setAttemptFeedbackState(view.attempt.feedback);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // ---- Dirty tracking --------------------------------------------------

  // A row is dirty if its draft would produce different writes than the
  // server already has. We compare to what setManualResponseGrade would
  // write (manualPoints + feedback).
  function isRowDirty(question: QuizQuestion): boolean {
    const draft = drafts[question.id];
    const resp = responseByQuestionId.get(question.id) ?? null;
    if (!draft) return false;

    const savedManual = manualPointsFor(resp);
    const savedFeedback = resp?.feedback ?? '';

    // Compute what the draft *would* write.
    let nextManual: number | null;
    if (!draft.overriding) {
      // Not overriding (auto-graded kind, untouched) — would write null,
      // which keeps the auto score.
      nextManual = null;
    } else {
      const trimmed = draft.pointsInput.trim();
      if (trimmed === '') {
        // Empty input in override mode → would write null (revert to auto).
        nextManual = null;
      } else {
        const n = Number(trimmed);
        if (!Number.isFinite(n)) return true; // dirty (invalid) → still treated as dirty
        nextManual = n;
      }
    }

    return nextManual !== savedManual || draft.feedback !== savedFeedback;
  }

  const dirtyQuestionIds = useMemo(
    () => view.questions.filter(isRowDirty).map((q) => q.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drafts, view],
  );

  const isAttemptFeedbackDirty = attemptFeedback !== view.attempt.feedback;
  const hasDirty = dirtyQuestionIds.length > 0 || isAttemptFeedbackDirty;
  const totalDirtyCount =
    dirtyQuestionIds.length + (isAttemptFeedbackDirty ? 1 : 0);

  // ---- Validation ------------------------------------------------------

  function validateDraft(
    question: QuizQuestion,
  ): { ok: true; manualPoints: number | null } | { ok: false; reason: string } {
    const draft = drafts[question.id];
    if (!draft) return { ok: true, manualPoints: null };

    if (!draft.overriding) return { ok: true, manualPoints: null };

    const trimmed = draft.pointsInput.trim();
    if (trimmed === '') return { ok: true, manualPoints: null };

    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      return { ok: false, reason: 'Score must be a number.' };
    }
    if (n < 0) {
      return { ok: false, reason: 'Score cannot be negative.' };
    }
    if (n > question.points) {
      return {
        ok: false,
        reason: `Score cannot exceed the question's max of ${question.points}.`,
      };
    }
    return { ok: true, manualPoints: n };
  }

  // ---- Handlers --------------------------------------------------------

  function setRow(qid: string, patch: Partial<RowDraft>) {
    editingRef.current = true;
    setError(null);
    setDrafts((prev) => ({
      ...prev,
      [qid]: { ...prev[qid], ...patch },
    }));
  }

  function handleAttemptFeedbackChange(v: string) {
    editingRef.current = true;
    setError(null);
    setAttemptFeedbackState(v);
  }

  function handleAttemptFeedbackAiAccept(
    suggestedFeedback: string,
    generationId: string | null,
  ) {
    editingRef.current = true;
    setAttemptFeedbackState(suggestedFeedback);
    setPendingGenerationId(generationId);
    setError(null);
  }

  function handleStartOverride(qid: string) {
    const q = view.questions.find((x) => x.id === qid);
    if (!q) return;
    const r = responseByQuestionId.get(qid) ?? null;
    // Seed override input with current auto value (if any) so the teacher
    // can nudge up/down rather than retype.
    const auto = autoPointsFor(r);
    setRow(qid, {
      overriding: true,
      pointsInput: auto !== null ? String(auto) : '',
    });
  }

  function handleCancelOverride(qid: string) {
    const q = view.questions.find((x) => x.id === qid);
    if (!q) return;
    // Restore the seeded draft for this row only.
    const r = responseByQuestionId.get(qid) ?? null;
    setDrafts((prev) => ({ ...prev, [qid]: seedDraft(q, r) }));
  }

  function handleSaveAll() {
    setError(null);

    // Validate everything first; surface the first failure with question
    // index so the teacher can find it.
    const writes: Array<{
      responseId: string;
      manualPoints: number | null;
      feedback: string;
    }> = [];

    for (let i = 0; i < view.questions.length; i++) {
      const q = view.questions[i];
      if (!isRowDirty(q)) continue;
      const v = validateDraft(q);
      if (!v.ok) {
        setError(`Question ${i + 1}: ${v.reason}`);
        return;
      }
      const r = responseByQuestionId.get(q.id);
      if (!r) {
        // No response row exists — we can't call setManualResponseGrade
        // because that requires a response id. Skip silently; teacher
        // should leave feedback on questions with responses only.
        // (Future enhancement: insert a response shell server-side.)
        continue;
      }
      writes.push({
        responseId: r.id,
        manualPoints: v.manualPoints,
        feedback: drafts[q.id]?.feedback ?? '',
      });
    }

    if (writes.length === 0 && !isAttemptFeedbackDirty) {
      setError('No changes to save.');
      return;
    }

    const generationId = pendingGenerationId;
    const feedbackToSave = attemptFeedback;
    const shouldSaveAttemptFeedback = isAttemptFeedbackDirty;

    startTransition(async () => {
      try {
        // Parallel writes: per-question grades + optional attempt-level
        // feedback. One recompute at the end. Per Session 11 design
        // decision: leave returned_at as-is — recomputeQuizScore updates
        // the score but doesn't re-release.
        const promises: Promise<unknown>[] = writes.map((w) =>
          setManualResponseGrade({
            responseId: w.responseId,
            manualPoints: w.manualPoints,
            feedback: w.feedback,
          }),
        );
        if (shouldSaveAttemptFeedback) {
          promises.push(setAttemptFeedback(view.attempt.id, feedbackToSave));
        }
        await Promise.all(promises);
        await recomputeQuizScore(view.attempt.id);

        if (generationId && shouldSaveAttemptFeedback) {
          // Best-effort: never throws.
          await markAiGenerationPublished(generationId, {
            feedback: feedbackToSave,
          });
        }

        editingRef.current = false;
        setPendingGenerationId(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save grades.');
      }
    });
  }

  function handleDiscardAll() {
    setDrafts(buildInitialDrafts());
    setAttemptFeedbackState(view.attempt.feedback);
    setPendingGenerationId(null);
    editingRef.current = false;
    setError(null);
  }

  // ---- Render ----------------------------------------------------------

  const hasReleasedGrade = view.gradeReleasedAt !== null;

  // Count manual-pending questions (essay/short_answer with no manual_points)
  // — drives a header hint.
  const manualPendingCount = view.questions.filter((q) => {
    if (!MANUAL_ONLY_KINDS.has(q.questionKind)) return false;
    const r = responseByQuestionId.get(q.id);
    return !r || r.manualPoints === null;
  }).length;

  return (
    <div className="space-y-6">
      <Link
        href={`/teacher/classes/${view.classId}/activities/${view.activityId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {view.activityTitle}
      </Link>

      {/* Header */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-gray-900">
              {view.studentName || 'Unknown student'}
            </h1>
            <div className="mt-0.5 truncate text-sm text-gray-500">
              {view.studentEmail}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Started{' '}
                {new Date(view.attempt.startedAt).toLocaleString()}
              </span>
              {view.attempt.submittedAt && (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Submitted{' '}
                  {new Date(view.attempt.submittedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              Current score
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {view.currentScore}
              <span className="ml-1 text-sm font-normal text-gray-500">
                / {view.quizTotalPoints}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Status hints */}
      {!view.attempt.submittedAt && (
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            This attempt is still in progress. The student hasn&apos;t
            submitted yet, so responses may still change.
          </p>
        </div>
      )}

      {manualPendingCount > 0 && view.attempt.submittedAt && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            {manualPendingCount} question
            {manualPendingCount === 1 ? '' : 's'} awaiting manual grade.
            Until you grade {manualPendingCount === 1 ? 'it' : 'them'}, the
            student&apos;s score may still change.
          </p>
        </div>
      )}

      {hasReleasedGrade && (
        <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            Grade was released on{' '}
            {new Date(view.gradeReleasedAt!).toLocaleString()}. Saving
            changes here will update the student&apos;s visible score
            immediately.
          </p>
        </div>
      )}

      {/* Save bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm">
        <div className="text-xs text-gray-600">
          {hasDirty ? (
            <span className="font-medium text-amber-700">
              {totalDirtyCount} change{totalDirtyCount === 1 ? '' : 's'} unsaved
            </span>
          ) : (
            <span className="text-gray-400">No unsaved changes</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDiscardAll}
            disabled={pending || !hasDirty}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            Discard changes
          </button>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={pending || !hasDirty}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save grades
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Per-question rows */}
      <ul className="space-y-4">
        {view.questions.map((q, idx) => {
          const draft = drafts[q.id];
          const resp = responseByQuestionId.get(q.id) ?? null;
          const isAuto = AUTO_GRADED_KINDS.has(q.questionKind);
          const isManualOnly = MANUAL_ONLY_KINDS.has(q.questionKind);
          const dirty = isRowDirty(q);

          // Effective points display (what would be on the student's
          // score right now, before this save).
          const savedManual = manualPointsFor(resp);
          const savedAuto = autoPointsFor(resp);
          const effectivePoints =
            savedManual !== null
              ? savedManual
              : savedAuto !== null
                ? savedAuto
                : null;

          return (
            <li
              key={q.id}
              className={`rounded-lg border bg-white p-4 shadow-sm ${
                dirty ? 'border-amber-300' : 'border-gray-200'
              }`}
            >
              {/* Question header */}
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                    <span className="font-medium">Question {idx + 1}</span>
                    <span>·</span>
                    <span>{kindLabel(q.questionKind)}</span>
                    <span>·</span>
                    <span>
                      {q.points} pt{q.points === 1 ? '' : 's'}
                    </span>
                    {isManualOnly && (
                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        Manual grade required
                      </span>
                    )}
                    {dirty && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        Unsaved
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-900">
                    {q.prompt.trim() ? (
                      <MarkdownContent body={q.prompt} />
                    ) : (
                      <span className="italic text-gray-400">
                        (no prompt set)
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs uppercase tracking-wide text-gray-500">
                    Points
                  </div>
                  <div className="text-lg font-semibold text-gray-900">
                    {effectivePoints !== null ? effectivePoints : '—'}
                    <span className="ml-1 text-xs font-normal text-gray-500">
                      / {q.points}
                    </span>
                  </div>
                  {savedManual !== null && (
                    <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-700">
                      Override
                    </div>
                  )}
                </div>
              </div>

              {/* Student's answer */}
              <div className="mb-3">
                <StudentAnswerView question={q} response={resp} />
              </div>

              {/* Grade controls */}
              <div className="border-t border-gray-100 pt-3">
                {isAuto && draft && !draft.overriding ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-gray-500">
                      Auto-graded.
                      {savedAuto !== null && (
                        <>
                          {' '}
                          Student earned{' '}
                          <span className="font-medium text-gray-700">
                            {savedAuto} / {q.points}
                          </span>
                          .
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleStartOverride(q.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Pencil className="h-3 w-3" />
                      Override score
                    </button>
                  </div>
                ) : (
                  draft && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700">
                          {isManualOnly ? 'Score' : 'Override score'}
                          <input
                            type="number"
                            min={0}
                            max={q.points}
                            step="any"
                            value={draft.pointsInput}
                            onChange={(e) =>
                              setRow(q.id, { pointsInput: e.target.value })
                            }
                            disabled={pending}
                            placeholder={
                              isManualOnly ? '0' : 'leave blank to use auto'
                            }
                            className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
                          />
                          <span className="text-xs text-gray-500">
                            / {q.points}
                          </span>
                        </label>
                        {isAuto && (
                          <button
                            type="button"
                            onClick={() => handleCancelOverride(q.id)}
                            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Revert to auto
                          </button>
                        )}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          Feedback (optional, markdown)
                        </label>
                        <MarkdownEditor
                          value={draft.feedback}
                          onChange={(v) => setRow(q.id, { feedback: v })}
                          placeholder="Comments for the student about this question…"
                          rows={3}
                          disabled={pending}
                        />
                      </div>
                    </div>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Overall (attempt-level) feedback */}
      <div
        className={`rounded-lg border bg-white p-4 shadow-sm ${
          isAttemptFeedbackDirty ? 'border-amber-300' : 'border-gray-200'
        }`}
      >
        <AISuggestFeedbackProvider
          endpoint="/api/ai/feedback/quiz"
          body={{ attemptId: view.attempt.id }}
          disabled={pending}
          onAccept={handleAttemptFeedbackAiAccept}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
              <MessageSquare className="h-4 w-4" />
              Overall feedback
              {isAttemptFeedbackDirty && (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  Unsaved
                </span>
              )}
            </h2>
            <AISuggestFeedbackButton />
          </div>
          <p className="mb-2 text-xs text-gray-500">
            Shown to the student alongside their score after release.
            Per-question feedback above is independent of this.
          </p>
          <AISuggestFeedbackCard />
          <div className="mt-2">
            <MarkdownEditor
              value={attemptFeedback}
              onChange={handleAttemptFeedbackChange}
              placeholder="Overall thoughts on this attempt — what stood out, what to work on next…"
              rows={5}
              disabled={pending}
            />
          </div>
        </AISuggestFeedbackProvider>
      </div>

      {/* Bottom save bar (mirrors top — convenient on long quizzes) */}
      <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={handleDiscardAll}
          disabled={pending || !hasDirty}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RotateCcw className="h-3 w-3" />
          Discard changes
        </button>
        <button
          type="button"
          onClick={handleSaveAll}
          disabled={pending || !hasDirty}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Award className="h-4 w-4" />
          )}
          Save grades
        </button>
      </div>
    </div>
  );
}

function kindLabel(k: QuestionKind): string {
  switch (k) {
    case 'mc_single':
      return 'Multiple choice';
    case 'mc_multi':
      return 'Multiple choice (multi)';
    case 'true_false':
      return 'True / False';
    case 'short_answer':
      return 'Short answer';
    case 'essay':
      return 'Essay';
    case 'matching':
      return 'Matching';
  }
}
