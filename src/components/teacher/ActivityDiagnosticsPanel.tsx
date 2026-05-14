// src/components/teacher/ActivityDiagnosticsPanel.tsx
'use client';

import { useState, useTransition } from 'react';
import { Sparkles, Loader2, AlertCircle, Flag } from 'lucide-react';
import type {
  AnalyticsActivityOption,
  ActivityDiagnostics,
} from '@/lib/actions/analytics';

interface Props {
  classId: string;
  activities: AnalyticsActivityOption[];
}

type ReteachDraft = {
  summary: string;
  suggestions: Array<{ focus: string; rationale: string; action: string }>;
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

  async function loadDiagnostics(activityId: string) {
    setSelectedId(activityId);
    setDiag(null);
    setDraft(null);
    setError(null);
    if (!activityId) return;
    setLoading(true);
    try {
      // Use a lightweight GET-style call: we only need the diagnostic data,
      // not the AI. We piggyback on the AI route by calling a thin server
      // action via a fetch wrapper instead — simpler: just call AI route
      // directly when the teacher clicks "Suggest reteaching".
      // For the chart, we need the diagnostic. So we add a small route.
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
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
        No published activities yet. Create and publish an activity to see diagnostics.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium text-gray-700" htmlFor="activity-select">
          Activity:
        </label>
        <select
          id="activity-select"
          value={selectedId}
          onChange={(e) => loadDiagnostics(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        >
          <option value="">Select an activity…</option>
          {activities.map((a) => (
            <option key={a.id} value={a.id}>
              [{a.activityKind === 'quiz' ? 'Quiz' : 'Assignment'}] {a.title}
            </option>
          ))}
        </select>

        {selectedId && (
          <button
            type="button"
            onClick={generateReteach}
            disabled={aiPending || loading}
            className="ml-auto inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {aiPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {draft ? 'Regenerate' : 'Suggest reteaching'}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading diagnostics…
        </div>
      )}

      {diag && diag.kind === 'quiz' && <QuizDiagnosticView diag={diag} />}
      {diag && diag.kind === 'assignment' && <AssignmentDiagnosticView diag={diag} />}

      {draft && <ReteachCard draft={draft} />}

      {/* hidden, just to suppress unused-var lint if classId not consumed */}
      <input type="hidden" value={classId} />
    </div>
  );
}

function QuizDiagnosticView({
  diag,
}: {
  diag: Extract<ActivityDiagnostics, { kind: 'quiz' }>;
}) {
  const maxRate = 1;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Rollup label="Submitted attempts" value={String(diag.totalAttempts)} />
        <Rollup label="Mean score" value={fmtPct(diag.meanScorePct)} />
        <Rollup
          label="Flagged questions"
          value={String(diag.questions.filter((q) => q.isFlagged).length)}
          tone="red"
        />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 text-sm font-semibold text-gray-700">
          Correct rate per question
        </div>
        {diag.questions.length === 0 ? (
          <div className="text-sm text-gray-500">No questions in this quiz.</div>
        ) : (
          <div className="space-y-2">
            {diag.questions.map((q) => {
              const pct = q.correctRate * 100;
              const barColor = q.isFlagged
                ? 'bg-red-500'
                : q.correctRate < 0.7
                  ? 'bg-amber-500'
                  : 'bg-green-500';
              return (
                <div key={q.questionId}>
                  <div className="flex items-baseline justify-between text-xs text-gray-600">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-gray-800">Q{q.displayOrder}</span>
                      <span className="text-gray-400">[{q.kind}]</span>
                      {q.isFlagged && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
                          <Flag className="h-3 w-3" />
                          flagged
                        </span>
                      )}
                    </div>
                    <span className="font-medium text-gray-700">
                      {pct.toFixed(0)}% ({q.correctCount}/{q.totalResponses})
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full ${barColor} transition-all`}
                      style={{ width: `${Math.min(100, (q.correctRate / maxRate) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-0.5 truncate text-xs text-gray-500" title={q.promptPreview}>
                    {q.promptPreview}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AssignmentDiagnosticView({
  diag,
}: {
  diag: Extract<ActivityDiagnostics, { kind: 'assignment' }>;
}) {
  const maxCount = Math.max(1, ...diag.distribution.map((d) => d.count));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Rollup
          label="Submitted"
          value={`${diag.submissionCount}/${diag.totalEnrolled}`}
          subtitle={fmtRate(diag.submissionRate)}
        />
        <Rollup label="Graded" value={String(diag.gradedCount)} />
        <Rollup label="Mean score" value={fmtPct(diag.meanScorePct)} />
        <Rollup label="Pass rate" value={fmtRate(diag.passRate)} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 text-sm font-semibold text-gray-700">Score distribution (graded)</div>
        {diag.gradedCount === 0 ? (
          <div className="text-sm text-gray-500">No graded submissions yet.</div>
        ) : (
          <div className="space-y-2">
            {diag.distribution.map((d) => {
              const isLow = d.bucket === '0-59';
              const barColor = isLow
                ? 'bg-red-500'
                : d.bucket === '60-69'
                  ? 'bg-amber-500'
                  : 'bg-green-500';
              return (
                <div key={d.bucket}>
                  <div className="flex items-baseline justify-between text-xs text-gray-600">
                    <span className="font-semibold text-gray-800">{d.bucket}%</span>
                    <span>{d.count} student(s)</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full ${barColor} transition-all`}
                      style={{ width: `${(d.count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Rollup({
  label,
  value,
  subtitle,
  tone,
}: {
  label: string;
  value: string;
  subtitle?: string;
  tone?: 'red';
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone === 'red' ? 'text-red-700' : 'text-gray-900'}`}>
        {value}
      </div>
      {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
    </div>
  );
}

function ReteachCard({ draft }: { draft: ReteachDraft }) {
  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-purple-700">
        <Sparkles className="h-4 w-4" />
        Reteaching suggestions
      </div>
      <p className="text-sm text-gray-800">{draft.summary}</p>

      {draft.suggestions.length > 0 && (
        <div className="mt-3 space-y-2">
          {draft.suggestions.map((s, i) => (
            <div key={i} className="rounded-md border border-purple-100 bg-white p-3 text-sm">
              <div className="font-semibold text-gray-900">{s.focus}</div>
              <div className="mt-1 text-gray-700">{s.rationale}</div>
              <div className="mt-1 text-gray-700">
                <span className="font-medium text-purple-700">Try:</span> {s.action}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}