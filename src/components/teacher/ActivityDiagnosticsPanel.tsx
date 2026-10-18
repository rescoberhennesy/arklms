// src/components/teacher/ActivityDiagnosticsPanel.tsx
'use client';

import { useMemo, useState, useTransition } from 'react';
import { Loader2, AlertCircle, Flag } from 'lucide-react';
import type {
  AnalyticsActivityOption,
  ActivityDiagnostics,
} from '@/lib/actions/analytics';
import {
  ANALYTICS_CARD,
  SummaryCard,
  AiActionCard,
  AiResultCard,
  type SummaryRow,
} from './AnalyticsSideCards';

interface Props {
  classId: string;
  activities: AnalyticsActivityOption[];
}

type ReteachDraft = {
  summary: string;
  suggestions: Array<{ focus: string; rationale: string; action: string }>;
};

type QuizDiag = Extract<ActivityDiagnostics, { kind: 'quiz' }>;
type AssignmentDiag = Extract<ActivityDiagnostics, { kind: 'assignment' }>;

// Teacher-facing labels for stored question kinds.
const KIND_LABEL: Record<string, string> = {
  mc_single: 'Multiple choice',
  mc_multi: 'Multiple answers',
  true_false: 'True or False',
  short_answer: 'Identification',
  essay: 'Essay',
  matching: 'Matching',
};

function fmtPct(p: number | null): string {
  return p === null ? '—' : `${p.toFixed(1)}%`;
}
function fmtRate(r: number | null): string {
  return r === null ? '—' : `${(r * 100).toFixed(0)}%`;
}

export default function ActivityDiagnosticsPanel({ classId, activities }: Props) {
  const [selectedId, setSelectedId] = useState<string>('');
  const [diag, setDiag] = useState<ActivityDiagnostics | null>(null);
  const [draft, setDraft] = useState<ReteachDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiPending, startAi] = useTransition();

  const quizzes = activities.filter((a) => a.activityKind === 'quiz');
  const others = activities.filter((a) => a.activityKind !== 'quiz');

  async function loadDiagnostics(activityId: string) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  function generateReteach() {
    if (!selectedId) return;
    setError(null);
    setDraft(null);
    startAi(async () => {
      try {
        const res = await fetch('/api/ai/analytics/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activityId: selectedId }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? 'Failed to generate suggestions.');
          return;
        }
        setDraft(json.draft as ReteachDraft);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  if (activities.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
        No published activities yet. Create and publish an activity to see diagnostics.
      </div>
    );
  }

  const summaryRows: SummaryRow[] | null = diag
    ? diag.kind === 'quiz'
      ? [
          { label: 'Submitted attempts', value: String(diag.totalAttempts) },
          { label: 'Mean score', value: fmtPct(diag.meanScorePct), sub: 'Average across attempts' },
          (() => {
            const flagged = diag.questions.filter((q) => q.isFlagged).length;
            return {
              label: 'Flagged questions',
              value: String(flagged),
              sub: 'Most of the class got these wrong',
              tone: flagged > 0 ? ('red' as const) : undefined,
            };
          })(),
        ]
      : [
          {
            label: 'Submitted',
            value: `${diag.submissionCount}/${diag.totalEnrolled}`,
            sub: `${fmtRate(diag.submissionRate)} of the class`,
          },
          { label: 'Graded', value: String(diag.gradedCount) },
          { label: 'Mean score', value: fmtPct(diag.meanScorePct) },
          { label: 'Pass rate', value: fmtRate(diag.passRate) },
        ]
    : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      {/* Main column */}
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-zinc-600" htmlFor="activity-select">
            Activity
          </label>
          <select
            id="activity-select"
            value={selectedId}
            onChange={(e) => loadDiagnostics(e.target.value)}
            className="min-w-[280px] rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10"
          >
            <option value="">Select an activity…</option>
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

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {draft && <ReteachCard draft={draft} />}

        {!selectedId && (
          <div className={`${ANALYTICS_CARD} px-6 py-14 text-center`}>
            <p className="text-sm font-semibold text-zinc-900">Pick an activity or quiz</p>
            <p className="mt-1 text-sm text-zinc-500">See how the class did on each question.</p>
          </div>
        )}

        {diag && diag.kind === 'quiz' && <QuizQuestionList diag={diag} />}
        {diag && diag.kind === 'assignment' && <AssignmentDistribution diag={diag} />}
      </div>

      {/* Side column */}
      <aside className="space-y-4 lg:sticky lg:top-20">
        {summaryRows && <SummaryCard rows={summaryRows} />}
        {selectedId && (
          <AiActionCard
            title="Suggest reteaching"
            text="Uses the results here to suggest what to review with the class."
            buttonLabel={draft ? 'Regenerate' : 'Suggest reteaching'}
            onClick={generateReteach}
            pending={aiPending}
            disabled={loading}
          />
        )}
      </aside>

      {/* keeps classId referenced for lint (unchanged behaviour) */}
      <input type="hidden" value={classId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quiz: correct rate per question
// ---------------------------------------------------------------------------

function QuizQuestionList({ diag }: { diag: QuizDiag }) {
  const [onlyWeak, setOnlyWeak] = useState(false);

  // Number questions by their position in the quiz (Q1, Q2, …), then show weakest first.
  const items = useMemo(() => {
    const numbered = [...diag.questions]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((q, i) => ({ q, number: i + 1 }));
    const scored = numbered.filter(({ q }) => q.totalResponses > 0);
    const unscored = numbered.filter(({ q }) => q.totalResponses === 0);
    scored.sort((a, b) => a.q.correctRate - b.q.correctRate);
    const all = [...scored, ...unscored];
    return onlyWeak ? all.filter(({ q }) => q.totalResponses > 0 && (q.isFlagged || q.correctRate < 0.7)) : all;
  }, [diag.questions, onlyWeak]);

  return (
    <section className={`overflow-hidden ${ANALYTICS_CARD}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h3 className="text-[15px] font-bold text-zinc-900">Correct rate per question</h3>
          <p className="text-xs text-zinc-400">Weakest first</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
          <Legend color="bg-red-500" label="Flagged" />
          <Legend color="bg-amber-500" label="Below 70%" />
          <Legend color="bg-green-500" label="70% and up" />
          <label className="inline-flex items-center gap-1.5 font-semibold text-zinc-700">
            <input
              type="checkbox"
              checked={onlyWeak}
              onChange={(e) => setOnlyWeak(e.target.checked)}
              className="accent-red-600"
            />
            Only weak
          </label>
        </div>
      </div>

      {diag.questions.length === 0 ? (
        <p className="border-t border-zinc-100 px-5 py-8 text-center text-sm text-zinc-500">No questions in this quiz.</p>
      ) : items.length === 0 ? (
        <p className="border-t border-zinc-100 px-5 py-8 text-center text-sm text-zinc-500">No weak questions. Nice.</p>
      ) : (
        <ul>
          {items.map(({ q, number }) => {
            const scored = q.totalResponses > 0;
            const pct = q.correctRate * 100;
            const barColor = q.isFlagged ? 'bg-red-500' : q.correctRate < 0.7 ? 'bg-amber-500' : 'bg-green-500';
            return (
              <li key={q.questionId} className="border-t border-zinc-100 px-5 py-3.5">
                <div className="flex items-start gap-3.5">
                  <span className="w-9 shrink-0 pt-px text-[13px] font-extrabold text-zinc-500">Q{number}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-900" title={q.promptPreview}>
                      {q.promptPreview}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      {KIND_LABEL[q.kind] ?? q.kind}
                      {q.isFlagged && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                          <Flag className="h-3 w-3" />
                          Flagged
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {scored ? (
                      <>
                        <span className={`text-sm font-bold ${q.isFlagged ? 'text-red-700' : 'text-zinc-900'}`}>
                          {pct.toFixed(0)}%
                        </span>
                        <span className="ml-1.5 text-xs text-zinc-400">
                          {q.correctCount} of {q.totalResponses}
                        </span>
                      </>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500">
                        {q.kind === 'essay' ? 'Checked by teacher' : 'No answers yet'}
                      </span>
                    )}
                  </div>
                </div>
                {scored && (
                  <div className="ml-[50px] mt-2.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Activity (assignment): score distribution
// ---------------------------------------------------------------------------

function AssignmentDistribution({ diag }: { diag: AssignmentDiag }) {
  const maxCount = Math.max(1, ...diag.distribution.map((d) => d.count));
  return (
    <section className={`${ANALYTICS_CARD} p-5`}>
      <h3 className="text-[15px] font-bold text-zinc-900">Score distribution</h3>
      <p className="mb-4 text-xs text-zinc-400">Graded submissions only</p>
      {diag.gradedCount === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">No graded submissions yet.</p>
      ) : (
        <ul className="space-y-3">
          {diag.distribution.map((d) => {
            const barColor =
              d.bucket === '0-59' ? 'bg-red-500' : d.bucket === '60-69' ? 'bg-amber-500' : 'bg-green-500';
            return (
              <li key={d.bucket}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold text-zinc-800">{d.bucket}%</span>
                  <span className="text-xs text-zinc-500">
                    {d.count} {d.count === 1 ? 'student' : 'students'}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className={`h-full rounded-full ${barColor}`}
                    style={{ width: `${d.count === 0 ? 0 : Math.max(2, (d.count / maxCount) * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function ReteachCard({ draft }: { draft: ReteachDraft }) {
  return (
    <AiResultCard title="Reteaching suggestions">
      <p className="text-sm text-zinc-800">{draft.summary}</p>
      {draft.suggestions.length > 0 && (
        <div className="mt-3 space-y-2">
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
    </AiResultCard>
  );
}