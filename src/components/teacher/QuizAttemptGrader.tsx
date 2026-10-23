'use client';

import { useState, useEffect, useRef, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Loader2,
  Pencil,
  RotateCcw,
  X,
  AlertCircle,
} from 'lucide-react';
import MarkdownEditor from '@/components/dashboard/MarkdownEditor';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import StudentAnswerView from '@/components/teacher/StudentAnswerView';
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
  type McSingleConfig,
  type McMultiConfig,
  type TrueFalseConfig,
  type ShortAnswerConfig,
} from '@/lib/types/quizzes';

interface QuizAttemptGraderProps {
  view: AttemptForGradingView;
}

interface RowDraft {
  pointsInput: string;
  feedback: string;
  overriding: boolean;
}

type RowStatus = 'correct' | 'wrong' | 'partial' | 'check';
type Filter = 'all' | 'wrong' | 'correct' | 'check';

// ---------- helpers ----------

function seedDraft(question: QuizQuestion, response: QuizResponse | null): RowDraft {
  const isManualOnly = MANUAL_ONLY_KINDS.has(question.questionKind);
  const manual = response?.manualPoints ?? null;
  const auto = response?.autoPoints ?? null;
  let pointsInput = '';
  if (manual !== null) pointsInput = String(manual);
  else if (!isManualOnly && auto !== null) pointsInput = String(auto);
  return {
    pointsInput,
    feedback: response?.feedback ?? '',
    overriding: isManualOnly || manual !== null,
  };
}

function viewSignature(v: AttemptForGradingView): string {
  return [
    v.attempt.id,
    v.attempt.autoScore ?? '-',
    v.attempt.manualScoreOverride ?? '-',
    v.attempt.feedback,
    v.currentScore,
    v.gradeReleasedAt ?? '-',
    ...v.responses.map((r) => `${r.id}:${r.manualPoints ?? '-'}:${r.autoPoints ?? '-'}:${r.feedback ?? ''}`),
  ].join('|');
}

function kindLabel(k: QuestionKind): string {
  switch (k) {
    case 'mc_single':
      return 'Multiple choice';
    case 'mc_multi':
      return 'Multiple choice (multi)';
    case 'true_false':
      return 'True or False';
    case 'short_answer':
      return 'Identification';
    case 'essay':
      return 'Essay';
    case 'matching':
      return 'Matching';
  }
}

/** Plain-text student answer + correct answer for the compact view. */
function summarize(q: QuizQuestion, r: QuizResponse | null): { student: string | null; correct: string | null } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = (r?.answer ?? null) as any;
  switch (q.questionKind) {
    case 'mc_single': {
      const c = q.config as McSingleConfig;
      const sel = a?.selected;
      return {
        student: typeof sel === 'number' && sel >= 0 ? c.options[sel] ?? null : null,
        correct: c.options[c.correct[0]] ?? null,
      };
    }
    case 'mc_multi': {
      const c = q.config as McMultiConfig;
      const sel: number[] = Array.isArray(a?.selected) ? a.selected : [];
      return {
        student: sel.length ? sel.map((i) => c.options[i]).join(', ') : null,
        correct: c.correct.map((i) => c.options[i]).join(', '),
      };
    }
    case 'true_false': {
      const c = q.config as TrueFalseConfig;
      return {
        student: r && typeof a?.selected === 'boolean' ? (a.selected ? 'True' : 'False') : null,
        correct: c.correct ? 'True' : 'False',
      };
    }
    case 'short_answer': {
      const c = q.config as ShortAnswerConfig;
      return { student: a?.text?.trim() || null, correct: c.acceptable.join(' / ') };
    }
    case 'essay':
      return { student: a?.text?.trim() || null, correct: null };
    case 'matching':
      return { student: null, correct: null };
  }
}

function cleanScore(raw: string, max: number): string | null {
  let clean = raw.replace(/[^\d.]/g, '');
  const dot = clean.indexOf('.');
  if (dot !== -1) {
    clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  }
  if (clean !== '' && clean !== '.' && Number(clean) > max) return null;
  return clean;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const DOT: Record<RowStatus, string> = {
  correct: 'bg-emerald-50 text-emerald-700',
  wrong: 'bg-red-50 text-red-700',
  partial: 'bg-amber-50 text-amber-700',
  check: 'bg-zinc-100 text-zinc-500',
};

// ---------- component ----------

export default function QuizAttemptGrader({ view }: QuizAttemptGraderProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [detailsOpen, setDetailsOpen] = useState<Set<string>>(new Set());

  const responseByQuestionId = useMemo(() => {
    const m = new Map<string, QuizResponse>();
    for (const r of view.responses) m.set(r.questionId, r);
    return m;
  }, [view.responses]);

  const buildInitialDrafts = (): Record<string, RowDraft> => {
    const out: Record<string, RowDraft> = {};
    for (const q of view.questions) out[q.id] = seedDraft(q, responseByQuestionId.get(q.id) ?? null);
    return out;
  };

  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(buildInitialDrafts);
  const [attemptFeedback, setAttemptFeedbackState] = useState<string>(view.attempt.feedback);

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

  // ---- per-question state ----
  function effectivePoints(q: QuizQuestion): number | null {
    const r = responseByQuestionId.get(q.id) ?? null;
    if (r?.manualPoints != null) return r.manualPoints;
    if (MANUAL_ONLY_KINDS.has(q.questionKind)) return null;
    if (r?.autoPoints != null) return r.autoPoints;
    return r ? null : 0; // unanswered auto question = 0
  }

  function statusOf(q: QuizQuestion): RowStatus {
    const pts = effectivePoints(q);
    if (pts === null) return 'check';
    if (pts >= q.points) return 'correct';
    if (pts <= 0) return 'wrong';
    return 'partial';
  }

  function isRowDirty(q: QuizQuestion): boolean {
    const draft = drafts[q.id];
    const resp = responseByQuestionId.get(q.id) ?? null;
    if (!draft) return false;
    const savedManual = resp?.manualPoints ?? null;
    const savedFeedback = resp?.feedback ?? '';
    let nextManual: number | null = null;
    if (draft.overriding) {
      const t = draft.pointsInput.trim();
      if (t !== '') {
        const n = Number(t);
        if (!Number.isFinite(n)) return true;
        nextManual = n;
      }
    }
    return nextManual !== savedManual || draft.feedback !== savedFeedback;
  }

  const dirtyIds = useMemo(
    () => view.questions.filter(isRowDirty).map((q) => q.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drafts, view],
  );
  const isFeedbackDirty = attemptFeedback !== view.attempt.feedback;
  const dirtyCount = dirtyIds.length + (isFeedbackDirty ? 1 : 0);

  const statuses = useMemo(() => {
    const m = new Map<string, RowStatus>();
    for (const q of view.questions) m.set(q.id, statusOf(q));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const counts = {
    all: view.questions.length,
    wrong: view.questions.filter((q) => ['wrong', 'partial'].includes(statuses.get(q.id)!)).length,
    correct: view.questions.filter((q) => statuses.get(q.id) === 'correct').length,
    check: view.questions.filter((q) => statuses.get(q.id) === 'check').length,
  };

  const visible = view.questions
    .map((q, idx) => ({ q, idx }))
    .filter(({ q }) => {
      const s = statuses.get(q.id)!;
      if (filter === 'wrong') return s === 'wrong' || s === 'partial';
      if (filter === 'correct') return s === 'correct';
      if (filter === 'check') return s === 'check';
      return true;
    });

  // ---- handlers ----
  function setRow(qid: string, patch: Partial<RowDraft>) {
    editingRef.current = true;
    setError(null);
    setDrafts((prev) => ({ ...prev, [qid]: { ...prev[qid], ...patch } }));
  }

  function startAdjust(q: QuizQuestion) {
    const r = responseByQuestionId.get(q.id) ?? null;
    setRow(q.id, { overriding: true, pointsInput: r?.autoPoints != null ? String(r.autoPoints) : '' });
  }

  function cancelAdjust(q: QuizQuestion) {
    setDrafts((prev) => ({ ...prev, [q.id]: seedDraft(q, responseByQuestionId.get(q.id) ?? null) }));
  }

  function toggleDetails(id: string) {
    setDetailsOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function jumpTo(idx: number) {
    setFilter('all');
    setTimeout(() => document.getElementById(`q-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  function handleSaveAll() {
    setError(null);
    const writes: Array<{ responseId: string; manualPoints: number | null; feedback: string }> = [];

    for (let i = 0; i < view.questions.length; i++) {
      const q = view.questions[i];
      if (!isRowDirty(q)) continue;
      const draft = drafts[q.id];
      let manualPoints: number | null = null;
      if (draft.overriding && draft.pointsInput.trim() !== '') {
        const n = Number(draft.pointsInput.trim());
        if (!Number.isFinite(n) || n < 0 || n > q.points) {
          setError(`Question ${i + 1}: score must be between 0 and ${q.points}.`);
          jumpTo(i);
          return;
        }
        manualPoints = n;
      }
      const r = responseByQuestionId.get(q.id);
      if (!r) continue; // no answer row to grade
      writes.push({ responseId: r.id, manualPoints, feedback: draft.feedback });
    }

    if (writes.length === 0 && !isFeedbackDirty) return;

    const feedbackToSave = attemptFeedback;
    const saveFeedback = isFeedbackDirty;

    startTransition(async () => {
      try {
        const promises: Promise<unknown>[] = writes.map((w) => setManualResponseGrade(w));
        if (saveFeedback) promises.push(setAttemptFeedback(view.attempt.id, feedbackToSave));
        await Promise.all(promises);
        await recomputeQuizScore(view.attempt.id);
        editingRef.current = false;
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save grades.');
      }
    });
  }

  function handleDiscardAll() {
    setDrafts(buildInitialDrafts());
    setAttemptFeedbackState(view.attempt.feedback);
    editingRef.current = false;
    setError(null);
  }

  // ---- header data ----
  const released = view.gradeReleasedAt !== null;
  const submitted = !!view.attempt.submittedAt;
  const pct = view.quizTotalPoints > 0 ? Math.round((view.currentScore / view.quizTotalPoints) * 100) : 0;
  const minutes = submitted
    ? Math.max(1, Math.round((new Date(view.attempt.submittedAt!).getTime() - new Date(view.attempt.startedAt).getTime()) / 60_000))
    : null;
  const statusPill = !submitted
    ? { label: 'In progress', cls: 'bg-blue-50 text-blue-700' }
    : released
      ? { label: 'Released', cls: 'bg-emerald-50 text-emerald-700' }
      : { label: 'Not released', cls: 'bg-purple-50 text-purple-700' };

  const card = 'rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]';

  return (
    <div className="space-y-4 pb-24">
      <Link
        href={`/teacher/classes/${view.classId}/activities/${view.activityId}?tab=attempts`}
        className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to attempts
      </Link>

      {/* Header */}
      <div className={`${card} flex flex-wrap items-center justify-between gap-4 p-5`}>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-zinc-900">{view.studentName || 'Unknown student'}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {submitted ? `Submitted ${fmt(view.attempt.submittedAt!)}` : `Started ${fmt(view.attempt.startedAt)}`}
            {minutes !== null && ` · took ${minutes} min`}
            {view.attempt.isLate && <span className="font-semibold text-amber-700"> · Late</span>}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusPill.cls}`}>{statusPill.label}</span>
          <div className="text-right">
            <p className="leading-none">
              <span className="text-3xl font-extrabold text-zinc-900">{view.currentScore}</span>
              <span className="text-sm text-zinc-500"> / {view.quizTotalPoints}</span>
            </p>
            <p className="mt-1 text-xs text-zinc-500">{pct}%</p>
          </div>
        </div>
      </div>

      {!submitted && (
        <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Still in progress. Answers may change until the student submits.
        </div>
      )}

      {/* Jump grid */}
      <div className={`${card} p-4`}>
        <p className="mb-2 text-xs text-zinc-500">Jump to a question</p>
        <div className="flex flex-wrap gap-1.5">
          {view.questions.map((q, idx) => (
            <button
              key={q.id}
              type="button"
              onClick={() => jumpTo(idx)}
              title={`Question ${idx + 1}`}
              className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition hover:ring-2 hover:ring-zinc-300 ${DOT[statuses.get(q.id)!]} ${
                dirtyIds.includes(q.id) ? 'ring-2 ring-amber-400' : ''
              }`}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {/* Questions */}
      <section className={card}>
        <div className="flex flex-wrap gap-1 border-b border-zinc-100 px-4 py-3">
          {(
            [
              ['all', 'All', counts.all],
              ['wrong', 'Wrong', counts.wrong],
              ['correct', 'Correct', counts.correct],
              ...(counts.check > 0 ? ([['check', 'Needs check', counts.check]] as const) : []),
            ] as const
          ).map(([key, label, count]) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-[13px] transition ${
                  active ? 'bg-zinc-900 font-semibold text-white' : 'font-medium text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                {label}{' '}
                <span className={active ? 'text-white/60' : key === 'check' ? 'font-semibold text-red-600' : 'text-zinc-400'}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">Nothing here.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {visible.map(({ q, idx }) => {
              const r = responseByQuestionId.get(q.id) ?? null;
              const draft = drafts[q.id];
              const status = statuses.get(q.id)!;
              const isManualOnly = MANUAL_ONLY_KINDS.has(q.questionKind);
              const isAuto = AUTO_GRADED_KINDS.has(q.questionKind);
              const editing = !!draft?.overriding;
              const dirty = dirtyIds.includes(q.id);
              const pts = effectivePoints(q);
              const { student, correct } = summarize(q, r);
              const showDetails = detailsOpen.has(q.id) || q.questionKind === 'matching';

              return (
                <li
                  key={q.id}
                  id={`q-${idx}`}
                  className={`scroll-mt-24 px-4 py-4 ${dirty ? 'bg-amber-50/40' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${DOT[status]}`}>
                      {idx + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-xs text-zinc-500">
                        {kindLabel(q.questionKind)} · {q.points} pt{q.points === 1 ? '' : 's'}
                        {r?.manualPoints != null && isAuto && (
                          <span className="ml-1.5 font-semibold text-purple-700">· adjusted</span>
                        )}
                      </p>
                      <div className="text-sm text-zinc-900">
                        {q.prompt.trim() ? <MarkdownContent body={q.prompt} /> : <span className="italic text-zinc-400">(no question text)</span>}
                      </div>

                      {/* Compact answer */}
                      {q.questionKind === 'essay' ? (
                        <div className="mt-2 whitespace-pre-wrap rounded-xl bg-zinc-50 px-3 py-2.5 text-sm text-zinc-800">
                          {student ?? <span className="italic text-zinc-400">No answer</span>}
                        </div>
                      ) : q.questionKind !== 'matching' ? (
                        <div className="mt-2 flex flex-col items-start gap-1">
                          <span
                            className={`inline-flex max-w-full items-start gap-1.5 rounded-lg px-2.5 py-1 text-[13px] ${
                              status === 'correct' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                            }`}
                          >
                            {status === 'correct' ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                            <span>{student ?? <span className="italic">No answer</span>}</span>
                          </span>
                          {status !== 'correct' && correct && (
                            <span className="inline-flex max-w-full items-start gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-[13px] text-emerald-800">
                              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>{correct}</span>
                            </span>
                          )}
                        </div>
                      ) : null}

                      {/* Full answer view on demand (always for matching) */}
                      {q.questionKind !== 'essay' && (
                        <>
                          {q.questionKind !== 'matching' && (
                            <button
                              type="button"
                              onClick={() => toggleDetails(q.id)}
                              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800"
                            >
                              <ChevronDown className={`h-3.5 w-3.5 transition ${showDetails ? 'rotate-180' : ''}`} />
                              {showDetails ? 'Hide details' : 'Show all options'}
                            </button>
                          )}
                          {showDetails && (
                            <div className="mt-2">
                              <StudentAnswerView question={q} response={r} />
                            </div>
                          )}
                        </>
                      )}

                      {/* Score + feedback editor */}
                      {editing && draft && (
                        <div className="mt-3 space-y-2 rounded-xl border border-zinc-200 bg-white p-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-700">
                              {isManualOnly ? 'Score' : 'Adjusted score'}
                              <input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                aria-label={`Score for question ${idx + 1} out of ${q.points}`}
                                value={draft.pointsInput}
                                onChange={(e) => {
                                  const v = cleanScore(e.target.value, q.points);
                                  if (v !== null) setRow(q.id, { pointsInput: v });
                                }}
                                disabled={pending}
                                placeholder="0"
                                className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-sm focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10"
                              />
                              <span className="font-normal text-zinc-500">/ {q.points}</span>
                            </label>
                            {isAuto && (
                              <button
                                type="button"
                                onClick={() => cancelAdjust(q)}
                                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Use auto score
                              </button>
                            )}
                          </div>
                          <MarkdownEditor
                            value={draft.feedback}
                            onChange={(v) => setRow(q.id, { feedback: v })}
                            placeholder="Comment on this answer (optional)…"
                            rows={2}
                            disabled={pending}
                          />
                        </div>
                      )}
                    </div>

                    {/* Points + action */}
                    <div className="shrink-0 text-right">
                      <p className="text-base font-bold text-zinc-900">
                        {pts !== null ? pts : '—'}
                        <span className="text-xs font-normal text-zinc-500"> / {q.points}</span>
                      </p>
                      {!editing && isAuto && (
                        <button
                          type="button"
                          onClick={() => startAdjust(q)}
                          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800"
                        >
                          <Pencil className="h-3 w-3" />
                          Adjust
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Overall feedback */}
      <div className={`${card} p-5`}>
        <h2 className="text-[15px] font-bold text-zinc-900">
          Feedback for the student <span className="text-xs font-normal text-zinc-500">(optional)</span>
        </h2>
        <p className="mb-2 mt-0.5 text-xs text-zinc-500">Shown with their score after release.</p>
        <MarkdownEditor
          value={attemptFeedback}
          onChange={(v) => {
            editingRef.current = true;
            setError(null);
            setAttemptFeedbackState(v);
          }}
          placeholder="What stood out, what to work on next…"
          rows={4}
          disabled={pending}
        />
      </div>

      {/* Save bar: only when something changed */}
      {dirtyCount > 0 && (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-white shadow-xl">
          <span className="text-sm">
            {dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}
            {released && <span className="text-white/60"> · student sees the new score right away</span>}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDiscardAll}
              disabled={pending}
              className="rounded-xl border border-white/30 px-3 py-1.5 text-sm font-semibold hover:bg-white/10 disabled:opacity-60"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-1.5 text-sm font-bold hover:bg-red-700 disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save &amp; update score
            </button>
          </div>
        </div>
      )}
    </div>
  );
}