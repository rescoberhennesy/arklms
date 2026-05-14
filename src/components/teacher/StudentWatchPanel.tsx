// src/components/teacher/StudentWatchPanel.tsx
'use client';

import { useState, useTransition } from 'react';
import { Sparkles, Loader2, AlertCircle, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type {
  ClassStudentStatsResult,
  RiskLevel,
  StudentStats,
  Trend,
} from '@/lib/actions/analytics';

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

const RISK_STYLES: Record<RiskLevel, { row: string; pill: string; label: string }> = {
  at_risk: {
    row: 'bg-red-50/40',
    pill: 'bg-red-100 text-red-800',
    label: 'At risk',
  },
  watch: {
    row: 'bg-amber-50/40',
    pill: 'bg-amber-100 text-amber-800',
    label: 'Watch',
  },
  safe: {
    row: '',
    pill: 'bg-green-100 text-green-800',
    label: 'On track',
  },
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
  if (trend === 'stable') return <Minus className="h-4 w-4 text-gray-400" />;
  return <span className="text-xs text-gray-400">—</span>;
}

export default function StudentWatchPanel({ classId, initialData }: Props) {
  const [data] = useState(initialData);
  const [insight, setInsight] = useState<ClassInsightDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  if (data.studentCount === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
        No students enrolled in this class yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Rollup cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RollupCard label="Students" value={String(data.studentCount)} />
        <RollupCard label="Class average" value={fmtPct(data.classAvgPct)} />
        <RollupCard label="At risk" value={String(data.atRiskCount)} tone="red" />
        <RollupCard label="On watch" value={String(data.watchCount)} tone="amber" />
      </div>

      {/* AI button + result */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          AI reads these numbers and suggests interventions. Numbers above are computed, not AI-generated.
        </p>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {insight ? 'Regenerate insights' : 'Generate insights'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {insight && <InsightCard insight={insight} />}

      {/* Student table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Student</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Risk</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Overall</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Assignments</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Quizzes</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Submitted</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700">Trend</th>
            </tr>
          </thead>
          <tbody>
            {data.stats.map((s) => (
              <StudentRow key={s.studentId} s={s} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StudentRow({ s }: { s: StudentStats }) {
  const styles = RISK_STYLES[s.risk];
  return (
    <tr className={`border-b border-gray-100 ${styles.row}`}>
      <td className="px-3 py-2">
        <div className="font-medium text-gray-900">{s.fullName ?? 'Unknown'}</div>
        <div className="text-xs text-gray-500">{s.email}</div>
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles.pill}`}
          title={s.riskReasons.join('; ')}
        >
          {styles.label}
        </span>
      </td>
      <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmtPct(s.overallAvgPct)}</td>
      <td className="px-3 py-2 text-right text-gray-700">{fmtPct(s.assignmentAvgPct)}</td>
      <td className="px-3 py-2 text-right text-gray-700">{fmtPct(s.quizAvgPct)}</td>
      <td className="px-3 py-2 text-right text-gray-700">
        {fmtRate(s.submissionRate)}
        <span className="ml-1 text-xs text-gray-400">
          ({s.dueCount - s.missingCount}/{s.dueCount})
        </span>
      </td>
      <td className="px-3 py-2 text-center">
        <div className="inline-flex items-center justify-center" title={s.trend}>
          <TrendIcon trend={s.trend} />
        </div>
      </td>
    </tr>
  );
}

function RollupCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'red' | 'amber';
}) {
  const toneClass =
    tone === 'red'
      ? 'text-red-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : 'text-gray-900';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function InsightCard({ insight }: { insight: ClassInsightDraft }) {
  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-purple-700">
        <Sparkles className="h-4 w-4" />
        AI insight
      </div>
      <p className="text-sm text-gray-800">{insight.summary}</p>

      {insight.atRiskNotes.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            At-risk students
          </div>
          {insight.atRiskNotes.map((n, i) => (
            <div key={i} className="rounded-md border border-purple-100 bg-white p-3 text-sm">
              <div className="font-semibold text-gray-900">{n.studentName}</div>
              <div className="mt-1 text-gray-700">{n.observation}</div>
              <div className="mt-1 text-gray-700">
                <span className="font-medium text-purple-700">Try:</span> {n.suggestion}
              </div>
            </div>
          ))}
        </div>
      )}

      {insight.bright_spots && (
        <div className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">
          <span className="font-semibold">Bright spots: </span>
          {insight.bright_spots}
        </div>
      )}
    </div>
  );
}