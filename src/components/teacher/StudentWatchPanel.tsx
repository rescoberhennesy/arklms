// src/components/teacher/StudentWatchPanel.tsx
'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertCircle, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type {
  ClassStudentStatsResult,
  RiskLevel,
  StudentStats,
  Trend,
} from '@/lib/actions/analytics';
import {
  ANALYTICS_CARD,
  SummaryCard,
  AiActionCard,
  AiResultCard,
} from './AnalyticsSideCards';

interface Props {
  classId: string;
  initialData: ClassStudentStatsResult;
}

type ClassInsightDraft = {
  summary: string;
  atRiskNotes: Array<{
    studentName: string;
    observation: string;
    suggestion: string;
  }>;
  bright_spots: string;
};

type RiskFilter = 'all' | 'at_risk' | 'watch';

const RISK_STYLES: Record<RiskLevel, { pill: string; label: string; bar: string }> = {
  at_risk: { pill: 'bg-red-50 text-red-700', label: 'At risk', bar: 'bg-red-500' },
  watch: { pill: 'bg-amber-50 text-amber-700', label: 'On watch', bar: 'bg-amber-500' },
  safe: { pill: 'bg-green-50 text-green-700', label: 'On track', bar: 'bg-green-500' },
};

function fmtPct(p: number | null): string {
  return p === null ? '—' : `${p.toFixed(1)}%`;
}
function fmtRate(r: number | null): string {
  return r === null ? '—' : `${(r * 100).toFixed(0)}%`;
}

function TrendIcon({ trend }: { trend: Trend }) {
  if (trend === 'improving') return <TrendingUp className="h-4 w-4 text-green-600" />;
  if (trend === 'declining') return <TrendingDown className="h-4 w-4 text-red-600" />;
  if (trend === 'stable') return <Minus className="h-4 w-4 text-zinc-400" />;
  return <span className="text-xs text-zinc-300">—</span>;
}

export default function StudentWatchPanel({ classId, initialData }: Props) {
  const [data] = useState(initialData);
  const [insight, setInsight] = useState<ClassInsightDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<RiskFilter>('all');

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/ai/analytics/class', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? 'Failed to generate insights.');
          return;
        }
        setInsight(json.draft as ClassInsightDraft);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  // Lowest overall first, so the students who need help are on top.
  const rows = useMemo(() => {
    const list = filter === 'all' ? data.stats : data.stats.filter((s) => s.risk === filter);
    return [...list].sort((a, b) => (a.overallAvgPct ?? 101) - (b.overallAvgPct ?? 101));
  }, [data.stats, filter]);

  if (data.studentCount === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
        No students enrolled in this class yet.
      </div>
    );
  }

  const filters: { key: RiskFilter; label: string; count: number; alert?: boolean }[] = [
    { key: 'all', label: 'All', count: data.studentCount },
    { key: 'at_risk', label: 'At risk', count: data.atRiskCount, alert: data.atRiskCount > 0 },
    { key: 'watch', label: 'On watch', count: data.watchCount },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      {/* Main column */}
      <div className="min-w-0 space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {insight && <InsightCard insight={insight} />}

        <section className={`overflow-hidden ${ANALYTICS_CARD}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3.5">
            <div role="tablist" aria-label="Filter students" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={filter === f.key ? 'font-semibold text-zinc-900' : 'text-zinc-500 hover:text-zinc-900'}
                >
                  {f.label} <span className={f.alert ? 'text-red-600' : 'text-zinc-400'}>{f.count}</span>
                </button>
              ))}
            </div>
            <span className="text-xs text-zinc-400">Lowest overall first</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50/70">
                <tr className="text-left text-xs font-medium text-zinc-400">
                  <th className="px-5 py-2.5 font-medium">Student</th>
                  <th className="px-3 py-2.5 font-medium">Risk</th>
                  <th className="px-3 py-2.5 font-medium">Overall</th>
                  <th className="px-3 py-2.5 text-right font-medium">Activities</th>
                  <th className="px-3 py-2.5 text-right font-medium">Quizzes</th>
                  <th className="px-3 py-2.5 text-right font-medium">Submitted</th>
                  <th className="px-5 py-2.5 text-center font-medium">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-zinc-500">
                      No students in this group.
                    </td>
                  </tr>
                ) : (
                  rows.map((s) => <StudentRow key={s.studentId} s={s} />)
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Side column */}
      <aside className="space-y-4 lg:sticky lg:top-20">
        <SummaryCard
          rows={[
            { label: 'Students', value: String(data.studentCount), sub: 'Enrolled in this class' },
            { label: 'Class average', value: fmtPct(data.classAvgPct), sub: 'Across graded work' },
            { label: 'At risk', value: String(data.atRiskCount), tone: data.atRiskCount > 0 ? 'red' : undefined },
            { label: 'On watch', value: String(data.watchCount), tone: data.watchCount > 0 ? 'amber' : undefined },
          ]}
        />
        <AiActionCard
          title="AI insights"
          text="Reads the numbers and suggests interventions. The numbers themselves are computed, not AI-generated."
          buttonLabel={insight ? 'Regenerate insights' : 'Generate insights'}
          onClick={handleGenerate}
          pending={pending}
        />
      </aside>
    </div>
  );
}

function StudentRow({ s }: { s: StudentStats }) {
  const styles = RISK_STYLES[s.risk];
  const overall = s.overallAvgPct;
  return (
    <tr className="transition hover:bg-zinc-50/70">
      <td className="px-5 py-3.5">
        <div className="font-semibold text-zinc-900">{s.fullName ?? 'Unknown'}</div>
        <div className="max-w-[260px] truncate text-xs text-zinc-400">{s.email}</div>
      </td>
      <td className="px-3 py-3.5">
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${styles.pill}`}
          title={s.riskReasons.join('; ')}
        >
          {styles.label}
        </span>
      </td>
      <td className="px-3 py-3.5">
        <div className="flex min-w-[130px] items-center gap-2.5">
          <span className="font-bold text-zinc-900">{fmtPct(overall)}</span>
          {overall !== null && (
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
              <span
                className={`block h-full rounded-full ${styles.bar}`}
                style={{ width: `${Math.max(2, Math.min(100, overall))}%` }}
              />
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-3.5 text-right text-zinc-700">{fmtPct(s.assignmentAvgPct)}</td>
      <td className="px-3 py-3.5 text-right text-zinc-700">{fmtPct(s.quizAvgPct)}</td>
      <td className="px-3 py-3.5 text-right text-zinc-700">
        {fmtRate(s.submissionRate)}
        <span className="ml-1 text-xs text-zinc-400">
          ({s.dueCount - s.missingCount}/{s.dueCount})
        </span>
      </td>
      <td className="px-5 py-3.5 text-center">
        <div className="inline-flex items-center justify-center" title={s.trend}>
          <TrendIcon trend={s.trend} />
        </div>
      </td>
    </tr>
  );
}

function InsightCard({ insight }: { insight: ClassInsightDraft }) {
  return (
    <AiResultCard title="AI insight">
      <p className="text-sm text-zinc-800">{insight.summary}</p>

      {insight.atRiskNotes.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-400">At-risk students</p>
          {insight.atRiskNotes.map((n, i) => (
            <div key={i} className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-3 text-sm">
              <p className="font-semibold text-zinc-900">{n.studentName}</p>
              <p className="mt-1 text-zinc-700">{n.observation}</p>
              <p className="mt-1 text-zinc-700">
                <span className="font-semibold text-red-700">Try:</span> {n.suggestion}
              </p>
            </div>
          ))}
        </div>
      )}

      {insight.bright_spots && (
        <div className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-900">
          <span className="font-semibold">Bright spots: </span>
          {insight.bright_spots}
        </div>
      )}
    </AiResultCard>
  );
}