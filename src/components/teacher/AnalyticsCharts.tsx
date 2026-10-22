// src/components/teacher/AnalyticsCharts.tsx
'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ClassTimelinePoint, Trend } from '@/lib/actions/analytics';
import { ANALYTICS_CARD } from './AnalyticsSideCards';

const INK = '#18181b';
const RED = '#b91c1c';
const GRID = '#f4f4f5';
const AXIS = '#a1a1aa';
const PASSING = 75;

// DepEd-style buckets. The first two are failing (below 75).
export const SCORE_BUCKETS: { label: string; min: number; max: number; failing: boolean }[] = [
  { label: 'Below 60', min: 0, max: 60, failing: true },
  { label: '60–74', min: 60, max: 75, failing: true },
  { label: '75–79', min: 75, max: 80, failing: false },
  { label: '80–89', min: 80, max: 90, failing: false },
  { label: '90–100', min: 90, max: Infinity, failing: false },
];

function ChartCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={`${ANALYTICS_CARD} min-w-0 p-5`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-bold text-zinc-900">{title}</h3>
          {subtitle && <p className="text-xs text-zinc-400">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-zinc-200 text-sm text-zinc-400">
      {text}
    </div>
  );
}

// ============================================================================
// CLASS PERFORMANCE OVER TIME
// ============================================================================

type TrendRow = {
  label: string;
  title: string;
  kind: 'assignment' | 'quiz';
  classAvg: number | null;
  student: number | null;
  gradedCount: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TrendTooltip({ active, payload, studentName }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as TrendRow;
  return (
    <div className="max-w-[240px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-zinc-900">{row.title}</p>
      <p className="mb-1 text-zinc-400">{row.kind === 'quiz' ? 'Quiz' : 'Activity'}</p>
      <p className="text-zinc-700">
        Class average:{' '}
        <span className="font-bold text-zinc-900">
          {row.classAvg === null ? 'Not graded yet' : `${row.classAvg.toFixed(1)}%`}
        </span>
        {row.gradedCount > 0 && <span className="text-zinc-400"> ({row.gradedCount} graded)</span>}
      </p>
      {studentName && (
        <p className="text-zinc-700">
          {studentName}:{' '}
          <span className="font-bold" style={{ color: RED }}>
            {row.student === null ? '—' : `${row.student.toFixed(1)}%`}
          </span>
        </p>
      )}
    </div>
  );
}

export function ClassTrendChart({
  timeline,
  studentScores,
  studentName,
}: {
  timeline: ClassTimelinePoint[];
  studentScores?: (number | null)[];
  studentName?: string | null;
}) {
  const showStudent = Boolean(studentScores && studentName);

  const data: TrendRow[] = timeline.map((p, i) => ({
    label: `#${i + 1}`,
    title: p.title,
    kind: p.kind,
    classAvg: p.classAvgPct === null ? null : Math.round(p.classAvgPct * 10) / 10,
    student:
      showStudent && studentScores && studentScores[i] !== null && studentScores[i] !== undefined
        ? Math.round((studentScores[i] as number) * 10) / 10
        : null,
    gradedCount: p.gradedCount,
  }));

  const hasData = data.some((d) => d.classAvg !== null);

  return (
    <ChartCard
      title="Class performance over time"
      subtitle={
        showStudent
          ? `Class average vs ${studentName}`
          : 'Average score per activity, oldest first · click a student to compare'
      }
      right={
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: INK }} />
            Class
          </span>
          {showStudent && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: RED }} />
              Student
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t border-dashed" style={{ borderColor: RED }} />
            Passing (75)
          </span>
        </div>
      }
    >
      {!hasData ? (
        <EmptyChart text="No graded activities yet." />
      ) : (
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: AXIS }}
                tickLine={false}
                axisLine={{ stroke: '#e4e4e7' }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fontSize: 11, fill: AXIS }}
                tickLine={false}
                axisLine={false}
              />
              <ReferenceLine y={PASSING} stroke={RED} strokeDasharray="4 4" strokeOpacity={0.6} />
              <Tooltip content={<TrendTooltip studentName={showStudent ? studentName : null} />} />
              <Line
                type="monotone"
                dataKey="classAvg"
                stroke={INK}
                strokeWidth={2}
                dot={{ r: 3, fill: INK }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
              {showStudent && (
                <Line
                  type="monotone"
                  dataKey="student"
                  stroke={RED}
                  strokeWidth={2}
                  dot={{ r: 3, fill: RED }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

// ============================================================================
// SCORE DISTRIBUTION
// ============================================================================

export function ScoreDistributionChart({
  pcts,
  title,
  subtitle,
  emptyText = 'No scores yet.',
}: {
  pcts: number[];
  title: string;
  subtitle?: string;
  emptyText?: string;
}) {
  const data = SCORE_BUCKETS.map((b) => ({
    label: b.label,
    failing: b.failing,
    count: pcts.filter((p) => p >= b.min && p < b.max).length,
  }));
  const failingCount = data.filter((d) => d.failing).reduce((s, d) => s + d.count, 0);

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      right={
        pcts.length > 0 ? (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              failingCount > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
            }`}
          >
            {failingCount} of {pcts.length} below passing (75)
          </span>
        ) : null
      }
    >
      {pcts.length === 0 ? (
        <EmptyChart text={emptyText} />
      ) : (
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: AXIS }}
                tickLine={false}
                axisLine={{ stroke: '#e4e4e7' }}
                interval={0}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: AXIS }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                formatter={(value) => [`${value} student${value === 1 ? '' : 's'}`, 'Count']}
                contentStyle={{ borderRadius: 12, fontSize: 12, borderColor: '#e4e4e7' }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.label} fill={d.failing ? RED : INK} fillOpacity={d.failing ? 0.9 : 0.85} />
                ))}
                <LabelList dataKey="count" position="top" style={{ fontSize: 11, fontWeight: 700, fill: '#3f3f46' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

// ============================================================================
// SPARKLINE (table Trend column)
// ============================================================================

export function Sparkline({ values, trend }: { values: (number | null)[]; trend: Trend }) {
  const W = 80;
  const H = 24;
  const pts = values.filter((v): v is number => v !== null);

  if (pts.length < 2) {
    return <span className="inline-block w-[80px] text-center text-xs text-zinc-300">—</span>;
  }

  const stepX = W / (pts.length - 1);
  const y = (v: number) => H - 2 - (Math.max(0, Math.min(100, v)) / 100) * (H - 4);
  const points = pts.map((v, i) => `${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const color = trend === 'declining' ? RED : trend === 'improving' ? '#16a34a' : '#71717a';
  const last = pts[pts.length - 1];

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible" aria-hidden="true">
      <line x1={0} x2={W} y1={y(PASSING)} y2={y(PASSING)} stroke="#e4e4e7" strokeDasharray="2 2" />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={W} cy={y(last)} r={2} fill={color} />
    </svg>
  );
}