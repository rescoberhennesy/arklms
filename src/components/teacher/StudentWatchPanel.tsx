// src/components/teacher/StudentWatchPanel.tsx
'use client';

import { useMemo, useState, useTransition } from 'react';
import { Sparkles, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { ClassStudentStatsResult, RiskLevel, StudentStats, Trend } from '@/lib/actions/analytics';
import { Sparkline, ClassTrendChart, ScoreDistributionChart } from './AnalyticsCharts';
import AiModal from './AiModal';

interface Props {
  classId: string;
  initialData: ClassStudentStatsResult;
}

type ClassInsightDraft = {
  summary: string;
  atRiskNotes: Array<{ studentName: string; observation: string; suggestion: string }>;
  bright_spots: string;
};

type RiskFilter = 'all' | 'at_risk' | 'watch';

const RISK: Record<RiskLevel, { pill: string; label: string; bar: string }> = {
  at_risk: { pill: 'bg-red-50 text-red-700', label: 'At risk', bar: 'bg-red-500' },
  watch: { pill: 'bg-amber-50 text-amber-700', label: 'On watch', bar: 'bg-amber-500' },
  safe: { pill: 'bg-emerald-50 text-emerald-700', label: 'On track', bar: 'bg-emerald-500' },
};

const CARD =
  'rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]';

function pct(p: number | null): string {
  return p === null ? '—' : `${Math.round(p)}%`;
}

function TrendIcon({ trend }: { trend: Trend }) {
  if (trend === 'improving') return <TrendingUp className="h-4 w-4 text-emerald-600" />;
  if (trend === 'declining') return <TrendingDown className="h-4 w-4 text-red-600" />;
  if (trend === 'stable') return <Minus className="h-4 w-4 text-zinc-400" />;
  return null;
}

export default function StudentWatchPanel({ classId, initialData }: Props) {
  const data = initialData;
  const deped = data.gradingMethod === 'deped';
  const grade = (v: number | null) => (v === null ? '—' : deped ? String(Math.round(v)) : `${v.toFixed(1)}%`);

  const [insight, setInsight] = useState<ClassInsightDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [filter, setFilter] = useState<RiskFilter>('all');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const selectedStudent = data.stats.find((s) => s.studentId === selectedStudentId) ?? null;
  const overallPcts = data.stats.map((s) => s.overallAvgPct).filter((v): v is number => v !== null);

  function generate() {
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

  function openAi() {
    setModalOpen(true);
    if (!insight && !pending) generate();
  }

  const rows = useMemo(() => {
    const list = filter === 'all' ? data.stats : data.stats.filter((s) => s.risk === filter);
    return [...list].sort((a, b) => (a.overallAvgPct ?? 101) - (b.overallAvgPct ?? 101));
  }, [data.stats, filter]);

  const rates = data.stats.map((s) => s.submissionRate).filter((v): v is number => v !== null);
  const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;

  if (data.studentCount === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
        No students enrolled in this class yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats + AI */}
      <div className="flex flex-wrap items-stretch gap-2">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Class average" value={grade(data.classAvgPct)} />
          <Stat label="Submission rate" value={avgRate === null ? '—' : `${Math.round(avgRate * 100)}%`} />
          <Stat label="At risk" value={String(data.atRiskCount)} tone={data.atRiskCount ? 'text-red-600' : undefined} />
          <Stat label="On watch" value={String(data.watchCount)} tone={data.watchCount ? 'text-amber-600' : undefined} />
        </div>
        <button
          type="button"
          onClick={openAi}
          className="inline-flex min-h-11 items-center gap-2 self-center rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700 hover:bg-red-100"
        >
          <Sparkles className="h-4 w-4" />
          {insight ? 'View AI insights' : 'Get AI insights'}
        </button>
      </div>

      {/* Charts */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ClassTrendChart
          timeline={data.timeline}
          studentScores={selectedStudent?.scores}
          studentName={selectedStudent?.fullName}
        />
        <ScoreDistributionChart
          title="Grade distribution"
          subtitle="Each student's current grade"
          pcts={overallPcts}
          emptyText="No graded work yet."
        />
      </div>

      {/* Students */}
      <section className={`${CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-5 py-3">
          <div className="flex gap-1">
            {(
              [
                ['all', 'All', data.studentCount],
                ['at_risk', 'At risk', data.atRiskCount],
                ['watch', 'On watch', data.watchCount],
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
          <span className="text-xs text-zinc-400">Lowest first · click a name to compare on the chart</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">No students in this group.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {rows.map((s) => (
              <StudentRow
                key={s.studentId}
                s={s}
                grade={grade}
                selected={s.studentId === selectedStudentId}
                onSelect={() => setSelectedStudentId((cur) => (cur === s.studentId ? null : s.studentId))}
              />
            ))}
          </ul>
        )}
      </section>

      <AiModal
        open={modalOpen}
        title="AI insights"
        onClose={() => setModalOpen(false)}
        pending={pending}
        error={error}
        onRegenerate={generate}
      >
        {insight && <InsightBody insight={insight} />}
      </AiModal>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
      <p className={`text-xl font-bold ${tone ?? 'text-zinc-900'}`}>{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

function StudentRow({
  s,
  grade,
  selected,
  onSelect,
}: {
  s: StudentStats;
  grade: (v: number | null) => string;
  selected: boolean;
  onSelect: () => void;
}) {
  const r = RISK[s.risk];
  const overall = s.overallAvgPct;
  const details = [
    s.quizAvgPct !== null ? `Quizzes ${pct(s.quizAvgPct)}` : null,
    s.assignmentAvgPct !== null ? `Activities ${pct(s.assignmentAvgPct)}` : null,
    `${s.dueCount - s.missingCount}/${s.dueCount} submitted`,
  ].filter(Boolean);

  return (
    <li
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition ${
        selected ? 'bg-red-50/50' : 'hover:bg-zinc-50/70'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        title={selected ? 'Hide from chart' : 'Compare on chart'}
        className="min-w-[180px] flex-1 text-left"
      >
        <p className={`font-semibold ${selected ? 'text-red-700' : 'text-zinc-900'}`}>{s.fullName ?? 'Unknown'}</p>
        <p className="text-xs text-zinc-500">{details.join(' · ')}</p>
        {s.riskReasons.length > 0 && <p className="mt-0.5 text-xs text-zinc-400">Why: {s.riskReasons.join('; ')}</p>}
      </button>
      <div className="flex items-center gap-2" title={`Trend: ${s.trend}`}>
        <Sparkline values={s.scores} trend={s.trend} />
        <TrendIcon trend={s.trend} />
      </div>
      <div className="flex w-[160px] items-center gap-2.5">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
          {overall !== null && (
            <span className={`block h-full rounded-full ${r.bar}`} style={{ width: `${Math.max(2, Math.min(100, overall))}%` }} />
          )}
        </span>
        <span className="w-12 text-right text-sm font-bold text-zinc-900">{grade(overall)}</span>
      </div>
      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${r.pill}`}>{r.label}</span>
    </li>
  );
}

function InsightBody({ insight }: { insight: ClassInsightDraft }) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-zinc-800">{insight.summary}</p>
      {insight.atRiskNotes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Students to check on</p>
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
        <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
          <span className="font-semibold">Bright spots: </span>
          {insight.bright_spots}
        </div>
      )}
    </div>
  );
}