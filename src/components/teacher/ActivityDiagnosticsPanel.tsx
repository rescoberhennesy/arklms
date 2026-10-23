// src/components/teacher/ActivityDiagnosticsPanel.tsx
'use client';

import { useMemo, useState, useTransition } from 'react';
import { Loader2, AlertCircle, Sparkles, X, Check } from 'lucide-react';
import type { AnalyticsActivityOption, ActivityDiagnostics } from '@/lib/actions/analytics';
import AiModal from './AiModal';

interface Props {
  classId: string;
  activities: AnalyticsActivityOption[];
}

type ReteachDraft = {
  summary: string;
  suggestions: Array<{ focus: string; rationale: string; action: string }>;
};

type QuizDiag = Extract<ActivityDiagnostics, { kind: 'quiz' }>;
type AssignDiag = Extract<ActivityDiagnostics, { kind: 'assignment' }>;
type QFilter = 'all' | 'hard' | 'ok';

const KIND_LABEL: Record<string, string> = {
  mc_single: 'Multiple choice',
  mc_multi: 'Multiple answers',
  true_false: 'True or False',
  short_answer: 'Identification',
  essay: 'Essay',
  matching: 'Matching',
};

const CARD =
  'rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]';

function pct(p: number | null): string {
  return p === null ? '—' : `${Math.round(p)}%`;
}

export default function ActivityDiagnosticsPanel({ activities }: Props) {
  const [selectedId, setSelectedId] = useState<string>(activities[0]?.id ?? '');
  const [diag, setDiag] = useState<ActivityDiagnostics | null>(null);
  const [draft, setDraft] = useState<ReteachDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPending, startAi] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  async function load(activityId: string) {
    setSelectedId(activityId);
    setDiag(null);
    setDraft(null);
    setError(null);
    if (!activityId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/analytics/activity/diagnostics?id=${encodeURIComponent(activityId)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load diagnostics.');
        return;
      }
      setDiag(json.diagnostics as ActivityDiagnostics);
      setLoadedFor(activityId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  // Auto-load the first activity once
  if (selectedId && loadedFor === null && !loading && !error && !diag) {
    void load(selectedId);
  }

  function generate() {
    if (!selectedId) return;
    setAiError(null);
    startAi(async () => {
      try {
        const res = await fetch('/api/ai/analytics/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activityId: selectedId }),
        });
        const json = await res.json();
        if (!res.ok) {
          setAiError(json.error ?? 'Failed to generate suggestions.');
          return;
        }
        setDraft(json.draft as ReteachDraft);
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  function openAi() {
    setModalOpen(true);
    if (!draft && !aiPending) generate();
  }

  if (activities.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
        No published activities yet. Create and publish an activity to see diagnostics.
      </div>
    );
  }

  const quizzes = activities.filter((a) => a.activityKind === 'quiz');
  const others = activities.filter((a) => a.activityKind !== 'quiz');

  // Header stats
  let stats: { label: string; value: string; tone?: string }[] = [];
  if (diag?.kind === 'quiz') {
    const hard = diag.questions.filter((q) => q.totalResponses > 0 && q.correctRate < 0.5).length;
    const high = diag.scorePcts.length ? Math.max(...diag.scorePcts) : null;
    stats = [
      { label: 'Submitted', value: String(diag.totalAttempts) },
      { label: 'Average', value: pct(diag.meanScorePct) },
      { label: 'Highest', value: pct(high) },
      { label: 'Hard questions', value: String(hard), tone: hard ? 'text-red-600' : undefined },
    ];
  } else if (diag?.kind === 'assignment') {
    stats = [
      { label: 'Submitted', value: `${diag.submissionCount}/${diag.totalEnrolled}` },
      { label: 'Graded', value: String(diag.gradedCount) },
      { label: 'Average', value: pct(diag.meanScorePct) },
      { label: 'Passed (75%+)', value: diag.passRate === null ? '—' : `${Math.round(diag.passRate * 100)}%` },
    ];
  }

  return (
    <div className="space-y-4">
      {/* Header card */}
      <section className={`${CARD} flex flex-wrap items-center justify-between gap-4 p-5`}>
        <div className="min-w-[240px] flex-1">
          <label htmlFor="activity-select" className="mb-1 block text-xs text-zinc-500">
            Activity
          </label>
          <div className="flex items-center gap-2">
            <select
              id="activity-select"
              value={selectedId}
              onChange={(e) => load(e.target.value)}
              className="w-full max-w-md rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-zinc-900 focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10"
            >
              {quizzes.length > 0 && (
                <optgroup label="Quizzes">
                  {quizzes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label="Activities">
                  {others.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
          </div>
        </div>

        {stats.length > 0 && (
          <div className="flex flex-wrap gap-6">
            {stats.map((s) => (
              <div key={s.label}>
                <p className={`text-xl font-bold ${s.tone ?? 'text-zinc-900'}`}>{s.value}</p>
                <p className="text-xs text-zinc-500">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {diag && (
          <button
            type="button"
            onClick={openAi}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700 hover:bg-red-100"
          >
            <Sparkles className="h-4 w-4" />
            {draft ? 'View reteaching ideas' : 'Suggest reteaching'}
          </button>
        )}
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {diag?.kind === 'quiz' && <QuestionList diag={diag} />}
      {diag?.kind === 'assignment' && <AssignmentBreakdown diag={diag} />}

      <AiModal
        open={modalOpen}
        title="Reteaching suggestions"
        onClose={() => setModalOpen(false)}
        pending={aiPending}
        error={aiError}
        onRegenerate={generate}
      >
        {draft && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-zinc-800">{draft.summary}</p>
            {draft.suggestions.map((s, i) => (
              <div key={i} className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-3 text-sm">
                <p className="font-semibold text-zinc-900">{s.focus}</p>
                <p className="mt-1 text-zinc-700">{s.rationale}</p>
                <p className="mt-1 text-zinc-700">
                  <span className="font-semibold text-red-700">Try:</span> {s.action}
                </p>
              </div>
            ))}
          </div>
        )}
      </AiModal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quiz questions, hardest first, with the most common wrong answer
// ---------------------------------------------------------------------------

function QuestionList({ diag }: { diag: QuizDiag }) {
  const [filter, setFilter] = useState<QFilter>('all');

  const items = useMemo(() => {
    const numbered = [...diag.questions]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((q, i) => ({ q, number: i + 1 }));
    const scored = numbered.filter(({ q }) => q.totalResponses > 0).sort((a, b) => a.q.correctRate - b.q.correctRate);
    const unscored = numbered.filter(({ q }) => q.totalResponses === 0);
    return [...scored, ...unscored];
  }, [diag.questions]);

  const isHard = (rate: number, total: number) => total > 0 && rate < 0.5;
  const hardCount = items.filter(({ q }) => isHard(q.correctRate, q.totalResponses)).length;
  const okCount = items.filter(({ q }) => q.totalResponses > 0 && q.correctRate >= 0.5).length;

  const visible = items.filter(({ q }) => {
    if (filter === 'hard') return isHard(q.correctRate, q.totalResponses);
    if (filter === 'ok') return q.totalResponses > 0 && q.correctRate >= 0.5;
    return true;
  });

  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-5 py-3">
        <div>
          <h3 className="text-[15px] font-bold text-zinc-900">Questions, hardest first</h3>
          <p className="text-xs text-zinc-400">Shows what students got wrong most often</p>
        </div>
        <div className="flex gap-1">
          {(
            [
              ['all', 'All', items.length],
              ['hard', 'Hard', hardCount],
              ['ok', 'OK', okCount],
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
                {label} <span className={active ? 'text-white/60' : 'text-zinc-400'}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-zinc-500">
          {filter === 'hard' ? 'No hard questions. Nice.' : 'Nothing here.'}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {visible.map(({ q, number }) => {
            const scored = q.totalResponses > 0;
            const rate = q.correctRate * 100;
            const hard = isHard(q.correctRate, q.totalResponses);
            const tone = !scored
              ? 'bg-zinc-100 text-zinc-500'
              : hard
                ? 'bg-red-50 text-red-700'
                : q.correctRate < 0.75
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-emerald-50 text-emerald-700';
            const bar = hard ? 'bg-red-500' : q.correctRate < 0.75 ? 'bg-amber-500' : 'bg-emerald-500';
            return (
              <li key={q.questionId} className="flex items-start gap-3 px-5 py-3.5">
                <span className={`mt-0.5 shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold ${tone}`}>Q{number}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-900">{q.promptPreview}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">{KIND_LABEL[q.kind] ?? q.kind}</p>
                  {scored && q.topWrongAnswer && q.topWrongCount > 0 && (
                    <div className="mt-2 flex flex-col items-start gap-1">
                      <span className="inline-flex max-w-full items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-1 text-xs text-red-800">
                        <X className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                          Most picked wrong: <b className="font-semibold">“{q.topWrongAnswer}”</b> ({q.topWrongCount}{' '}
                          student{q.topWrongCount === 1 ? '' : 's'})
                        </span>
                      </span>
                      {q.correctAnswer && (
                        <span className="inline-flex max-w-full items-start gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800">
                          <Check className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>
                            Correct: <b className="font-semibold">{q.correctAnswer}</b>
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="w-[120px] shrink-0 text-right">
                  {scored ? (
                    <>
                      <p className={`text-sm font-bold ${hard ? 'text-red-700' : 'text-zinc-900'}`}>
                        {Math.round(rate)}% correct
                      </p>
                      <p className="text-xs text-zinc-400">
                        {q.correctCount} of {q.totalResponses}
                      </p>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(2, rate)}%` }} />
                      </div>
                    </>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500">
                      {q.kind === 'essay' ? 'Checked by teacher' : 'No answers yet'}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Assignment: score spread
// ---------------------------------------------------------------------------

function AssignmentBreakdown({ diag }: { diag: AssignDiag }) {
  const max = Math.max(1, ...diag.distribution.map((d) => d.count));
  return (
    <section className={`${CARD} p-5`}>
      <h3 className="text-[15px] font-bold text-zinc-900">Score spread</h3>
      <p className="mb-3 text-xs text-zinc-400">Graded submissions only</p>
      {diag.gradedCount === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">No graded submissions yet.</p>
      ) : (
        <ul className="space-y-2">
          {diag.distribution.map((d) => {
            const low = d.bucket === '0-59' || d.bucket === '60-69';
            return (
              <li key={d.bucket} className="grid grid-cols-[64px_1fr_32px] items-center gap-3 text-sm">
                <span className="text-zinc-600">{d.bucket}%</span>
                <span className="h-3 overflow-hidden rounded-full bg-zinc-100">
                  <span
                    className={`block h-full rounded-full ${low ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${(d.count / max) * 100}%` }}
                  />
                </span>
                <span className="text-right font-bold text-zinc-900">{d.count}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}