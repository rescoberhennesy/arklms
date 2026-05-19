import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Minus,
  ExternalLink,
} from 'lucide-react';
import {
  getMyClassAnalytics,
  type MyClassAnalyticsFilters,
  type ClassHealthCard,
  type AtRiskStudentRow,
} from '@/lib/actions/analytics';
import { listMyClasses } from '@/lib/actions/classes';
import TeacherAnalyticsFilterBar from '@/components/teacher/TeacherAnalyticsFilterBar';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    classId?: string;
    section?: string;
    track?: string;
    grade?: string;
  }>;
}

export default async function TeacherAnalyticsPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const filters: MyClassAnalyticsFilters = {
    classId: sp.classId || null,
    section: sp.section || null,
    track: sp.track || null,
    gradeLevel: sp.grade || null,
  };

  const [allClassesRes, aggregated] = await Promise.all([
    listMyClasses(),
    getMyClassAnalytics(filters),
  ]);

  if (!allClassesRes.ok) {
    return (
      <div className="space-y-4 p-6">
        <PageHeader />
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Failed to load classes: {allClassesRes.error}
        </div>
      </div>
    );
  }

  const allActiveClasses = allClassesRes.data.filter((c) => !c.is_archived);
  const totalCount = allActiveClasses.length;
  const matchedCount = aggregated.healthCards.length;

  // Cross-class totals for the at-a-glance bar at the top of the page.
  const totalAtRiskStudents = aggregated.atRiskStudents.filter(
    (s) => s.atRiskClassCount > 0,
  ).length;
  const totalWatchOnlyStudents = aggregated.atRiskStudents.filter(
    (s) => s.atRiskClassCount === 0 && s.watchClassCount > 0,
  ).length;
  const totalAwaitingGrades = aggregated.healthCards.reduce(
    (sum, c) => sum + c.studentsAwaitingGrades,
    0,
  );
  const totalMissingSubmissions = aggregated.healthCards.reduce(
    (sum, c) => sum + c.totalMissingSubmissions,
    0,
  );

  return (
    <div className="space-y-4 p-6">
      <PageHeader />

      <TeacherAnalyticsFilterBar
        classes={allActiveClasses}
        matchedCount={matchedCount}
        totalCount={totalCount}
      />

      {totalCount === 0 ? (
        <EmptyState
          title="No active classes yet"
          message="You don't have any active classes. Create one from the Classes page to start tracking analytics."
        />
      ) : matchedCount === 0 ? (
        <EmptyState
          title="No classes match your filters"
          message="Try clearing one or more filters to see your analytics."
        />
      ) : (
        <>
          {/* Top-line summary bar */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat
              label="At-risk students"
              value={totalAtRiskStudents}
              tone="danger"
            />
            <SummaryStat
              label="On watch"
              value={totalWatchOnlyStudents}
              tone="warning"
            />
            <SummaryStat
              label="Awaiting grades"
              value={totalAwaitingGrades}
              tone="info"
            />
            <SummaryStat
              label="Missing submissions"
              value={totalMissingSubmissions}
              tone="neutral"
            />
          </div>

          {/* Class health cards grid */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              Class health
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {aggregated.healthCards.map((card) => (
                <HealthCard key={card.class.id} card={card} />
              ))}
            </div>
          </section>

          {/* Cross-class at-risk students roll-up */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                Students needing attention
              </h2>
              <span className="text-xs text-gray-500">
                {aggregated.atRiskStudents.length}{' '}
                {aggregated.atRiskStudents.length === 1
                  ? 'student'
                  : 'students'}{' '}
                flagged across {matchedCount}{' '}
                {matchedCount === 1 ? 'class' : 'classes'}
              </span>
            </div>
            {aggregated.atRiskStudents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-green-200 bg-green-50 p-8 text-center">
                <p className="text-sm font-semibold text-green-800">
                  Nobody flagged. Nice work.
                </p>
                <p className="mt-1 text-xs text-green-700">
                  No students are currently at-risk or on watch in any of these
                  classes.
                </p>
              </div>
            ) : (
              <AtRiskStudentsTable rows={aggregated.atRiskStudents} />
            )}
          </section>

          {/* Methodology footnote — defensible-by-design note for the
              defense. Same reasoning we've used throughout: per-class
              numbers are real, cross-class aggregations are only counts
              of risk flags, never averaged scores. */}
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer font-medium">
              How is "at-risk" decided?
            </summary>
            <div className="mt-2 space-y-1 rounded-md border border-gray-200 bg-gray-50 p-3">
              <p>
                Each student is classified per-class. The aggregation on this
                page counts how many classes flag them — it never averages
                scores across classes (different subjects, different weights).
              </p>
              <p>
                <strong>At-risk</strong> if any of: avg score below 70%,
                submission rate below 60%, or score trend declining.
              </p>
              <p>
                <strong>Watch</strong> if borderline: avg score 70–75% or
                submission rate 60–70%.
              </p>
              <p>
                Trend uses the last 3 graded activities vs earlier ones; needs
                at least 4 data points (graded + missing).
              </p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Subcomponents
// --------------------------------------------------------------------------

function PageHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Link
          href="/teacher/dashboard"
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to dashboard
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-gray-900">
          <BarChart3 className="h-6 w-6 text-red-600" />
          Analytics
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          A health check across all your classes. Per-class deep-dives (quiz
          question diagnostics, score distributions) live inside each class —
          click a card to open them.
        </p>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'danger' | 'warning' | 'info' | 'neutral';
}) {
  const colorClasses: Record<typeof tone, string> = {
    danger: 'border-red-200 bg-red-50 text-red-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    neutral: 'border-gray-200 bg-gray-50 text-gray-900',
  };
  return (
    <div
      className={`rounded-xl border ${colorClasses[tone]} px-4 py-3 shadow-sm`}
    >
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-medium opacity-80">{label}</div>
    </div>
  );
}

function HealthCard({ card }: { card: ClassHealthCard }) {
  const c = card.class;
  return (
    <Link
      href={`/teacher/classes/${c.id}?tab=analytics`}
      className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-red-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-900">
            {c.name}
          </h3>
          <p className="truncate text-xs text-gray-500">
            {[c.section, c.grade_level, c.track].filter(Boolean).join(' · ') ||
              'No section info'}
            {' · '}
            {card.studentCount}{' '}
            {card.studentCount === 1 ? 'student' : 'students'}
          </p>
        </div>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-400" />
      </div>

      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums text-gray-900">
          {card.classAvgPct === null
            ? '—'
            : `${card.classAvgPct.toFixed(1)}%`}
        </span>
        <span className="text-xs text-gray-500">class avg</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <RiskTile label="At-risk" value={card.atRiskCount} tone="danger" />
        <RiskTile label="Watch" value={card.watchCount} tone="warning" />
        <RiskTile label="Safe" value={card.safeCount} tone="success" />
      </div>

      {(card.studentsAwaitingGrades > 0 || card.totalMissingSubmissions > 0) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {card.studentsAwaitingGrades > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-800">
              {card.studentsAwaitingGrades} awaiting grades
            </span>
          )}
          {card.totalMissingSubmissions > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
              {card.totalMissingSubmissions} missing submissions
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function RiskTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'danger' | 'warning' | 'success';
}) {
  const colorClasses = {
    danger: value > 0 ? 'bg-red-50 text-red-900' : 'bg-gray-50 text-gray-400',
    warning:
      value > 0 ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-400',
    success:
      value > 0 ? 'bg-green-50 text-green-900' : 'bg-gray-50 text-gray-400',
  };
  return (
    <div className={`rounded-md px-1 py-1.5 ${colorClasses[tone]}`}>
      <div className="text-sm font-bold tabular-nums">{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide opacity-80">
        {label}
      </div>
    </div>
  );
}

function AtRiskStudentsTable({ rows }: { rows: AtRiskStudentRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5">Student</th>
              <th className="px-4 py-2.5">Flagged in</th>
              <th className="px-4 py-2.5">Worst avg</th>
              <th className="px-4 py-2.5">Reasons</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <StudentRow key={row.studentId} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StudentRow({ row }: { row: AtRiskStudentRow }) {
  // Collapse all unique reasons across memberships into a single readable
  // list — most teachers don't care which class said "low submission rate";
  // they care that this student has a low submission rate.
  const uniqueReasons = Array.from(
    new Set(row.memberships.flatMap((m) => m.riskReasons)),
  );

  return (
    <tr className="hover:bg-gray-50/60">
      <td className="px-4 py-3 align-top">
        <div className="font-medium text-gray-900">
          {row.fullName ?? 'Unknown'}
        </div>
        <div className="text-xs text-gray-500">{row.email}</div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex flex-wrap gap-1.5">
          {row.memberships.map((m) => (
            <Link
              key={m.classId}
              href={`/teacher/classes/${m.classId}?tab=analytics`}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition hover:opacity-80 ${
                m.risk === 'at_risk'
                  ? 'bg-red-100 text-red-900'
                  : 'bg-amber-100 text-amber-900'
              }`}
              title={`${m.className} — ${m.risk === 'at_risk' ? 'At-risk' : 'Watch'}`}
            >
              {m.risk === 'at_risk' ? (
                <AlertTriangle className="h-3 w-3" />
              ) : null}
              <span className="max-w-[14ch] truncate">{m.className}</span>
              <TrendIcon trend={m.trend} />
            </Link>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 align-top tabular-nums text-gray-700">
        {row.worstAvgPct === null ? '—' : `${row.worstAvgPct.toFixed(1)}%`}
      </td>
      <td className="px-4 py-3 align-top text-xs text-gray-600">
        {uniqueReasons.length === 0 ? (
          <span className="italic text-gray-400">—</span>
        ) : (
          <ul className="space-y-0.5">
            {uniqueReasons.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}

function TrendIcon({
  trend,
}: {
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
}) {
  if (trend === 'declining') {
    return (
      <TrendingDown className="h-3 w-3" aria-label="Trend: declining" />
    );
  }
  if (trend === 'improving') {
    return (
      <TrendingUp className="h-3 w-3" aria-label="Trend: improving" />
    );
  }
  if (trend === 'stable') {
    return <Minus className="h-3 w-3" aria-label="Trend: stable" />;
  }
  return null;
}

function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{message}</p>
    </div>
  );
}