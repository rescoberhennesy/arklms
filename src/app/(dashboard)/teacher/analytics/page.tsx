import Link from 'next/link';
import { AlertTriangle, TrendingDown, TrendingUp, Minus, ChevronRight } from 'lucide-react';
import {
  getMyClassAnalytics,
  type ClassHealthCard,
  type AtRiskStudentRow,
} from '@/lib/actions/analytics';
import { listMyClasses } from '@/lib/actions/classes';
import { DEFAULT_CLASS_COLOR } from '@/types/class';
import ShortcutClassPicker from '@/components/teacher/ShortcutClassPicker';

export const dynamic = 'force-dynamic';

const CARD = 'rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

interface PageProps {
  searchParams: Promise<{ classId?: string }>;
}

export default async function TeacherAnalyticsPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const [allClassesRes, aggregated] = await Promise.all([
    listMyClasses(),
    getMyClassAnalytics({ classId: null, section: null, track: null, gradeLevel: null }),
  ]);

  if (!allClassesRes.ok) {
    return (
      <div className="space-y-5">
        <PageHeader />
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Failed to load classes: {allClassesRes.error}
        </div>
      </div>
    );
  }

  const classes = allClassesRes.data.filter((c) => !c.is_archived);

  if (classes.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader />
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <h3 className="text-base font-bold text-zinc-900">No active classes yet</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Create a class from the Classes page to start tracking analytics.
          </p>
        </div>
      </div>
    );
  }

  const colorById = new Map(classes.map((c) => [c.id, c.color ?? DEFAULT_CLASS_COLOR]));

  // Picker labels: "N at risk" in red, else student count.
  const metaByClassId: Record<string, string> = {};
  const alertByClassId: Record<string, boolean> = {};
  for (const card of aggregated.healthCards) {
    const id = card.class.id;
    if (card.atRiskCount > 0) {
      metaByClassId[id] = `${card.atRiskCount} at risk`;
      alertByClassId[id] = true;
    } else {
      metaByClassId[id] = `${card.studentCount} ${card.studentCount === 1 ? 'student' : 'students'}`;
    }
  }

  // "All classes" (overview) unless a valid class is picked.
  const selectedClass = classes.find((c) => c.id === sp.classId) ?? null;
  const selectedId = selectedClass?.id ?? '';

  const healthCards = selectedId
    ? aggregated.healthCards.filter((h) => h.class.id === selectedId)
    : aggregated.healthCards;

  const students: AtRiskStudentRow[] = selectedId
    ? aggregated.atRiskStudents
        .map((s) => ({ ...s, memberships: s.memberships.filter((m) => m.classId === selectedId) }))
        .filter((s) => s.memberships.length > 0)
    : aggregated.atRiskStudents;

  // Totals (computed from memberships so they also work when filtered).
  const totalAtRisk = students.filter((s) => s.memberships.some((m) => m.risk === 'at_risk')).length;
  const totalWatchOnly = students.filter(
    (s) => !s.memberships.some((m) => m.risk === 'at_risk') && s.memberships.length > 0,
  ).length;
  const totalAwaiting = healthCards.reduce((sum, c) => sum + c.studentsAwaitingGrades, 0);
  const totalMissing = healthCards.reduce((sum, c) => sum + c.totalMissingSubmissions, 0);

  return (
    <div className="space-y-5">
      <PageHeader />

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-20">
          <ShortcutClassPicker
            classes={classes}
            selectedId={selectedId}
            metaByClassId={metaByClassId}
            alertByClassId={alertByClassId}
            allItemSubtitle="Overview"
          />
        </div>

        <div className="min-w-0 space-y-5">
          {/* Summary strip */}
          <section className={`${CARD} grid grid-cols-2 sm:grid-cols-4`}>
            <Stat label="At-risk students" value={totalAtRisk} sub="Needs help now" alert={totalAtRisk > 0} />
            <Stat label="On watch" value={totalWatchOnly} sub="Borderline, keep an eye on" />
            <Stat label="Awaiting grades" value={totalAwaiting} sub="Submissions to check" />
            <Stat label="Missing submissions" value={totalMissing} sub="Past due, not turned in" last />
          </section>

          {/* Students needing attention */}
          <section className={`overflow-hidden ${CARD}`}>
            <div className="px-5 py-4">
              <h2 className="text-base font-extrabold text-zinc-900">Students needing attention</h2>
              <p className="text-xs text-zinc-400">
                {students.length} {students.length === 1 ? 'student' : 'students'} flagged
                {selectedClass ? ` in ${selectedClass.name}` : ` across ${healthCards.length} ${healthCards.length === 1 ? 'class' : 'classes'}`}
              </p>
            </div>
            {students.length === 0 ? (
              <p className="border-t border-zinc-100 px-5 py-10 text-center text-sm text-zinc-500">
                Nobody flagged. No students are at risk or on watch.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-y border-zinc-100 bg-zinc-50/70">
                    <tr className="text-left text-xs text-zinc-400">
                      <th className="px-5 py-2.5 font-medium">Student</th>
                      <th className="px-3 py-2.5 font-medium">Flagged in</th>
                      <th className="px-3 py-2.5 font-medium">Lowest avg</th>
                      <th className="px-5 py-2.5 font-medium">Why</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {students.map((row) => (
                      <StudentRow key={row.studentId} row={row} colorById={colorById} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Class health */}
          <section className={`overflow-hidden ${CARD}`}>
            <div className="px-5 py-4">
              <h2 className="text-base font-extrabold text-zinc-900">Class health</h2>
              <p className="text-xs text-zinc-400">Click a class to open its Analytics tab</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-zinc-100 bg-zinc-50/70">
                  <tr className="text-left text-xs text-zinc-400">
                    <th className="px-5 py-2.5 font-medium">Class</th>
                    <th className="px-3 py-2.5 font-medium">Class average</th>
                    <th className="px-3 py-2.5 text-center font-medium">At risk</th>
                    <th className="px-3 py-2.5 text-center font-medium">Watch</th>
                    <th className="px-3 py-2.5 text-center font-medium">Safe</th>
                    <th className="px-5 py-2.5"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {healthCards.map((card) => (
                    <HealthRow key={card.class.id} card={card} color={colorById.get(card.class.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Methodology (unchanged text) */}
          <details className="px-1 text-xs text-zinc-500">
            <summary className="cursor-pointer font-semibold text-zinc-600">How is &quot;at-risk&quot; decided?</summary>
            <div className={`mt-2 space-y-1.5 p-4 ${CARD}`}>
              <p>
                Each student is classified per-class. The aggregation on this page counts how many classes flag
                them — it never averages scores across classes (different subjects, different weights).
              </p>
              <p>
                <strong>At-risk</strong> if any of: avg score below 70%, submission rate below 60%, or score trend
                declining.
              </p>
              <p>
                <strong>Watch</strong> if borderline: avg score 70–75% or submission rate 60–70%.
              </p>
              <p>
                Trend uses the last 3 graded activities vs earlier ones; needs at least 4 data points (graded +
                missing).
              </p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Subcomponents
// --------------------------------------------------------------------------

function PageHeader() {
  return (
    <div>
      <h1 className="text-[28px] font-extrabold tracking-tight text-zinc-900">Analytics</h1>
      <p className="mt-1 text-sm text-zinc-500">How your classes are doing, and who needs attention.</p>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  alert = false,
  last = false,
}: {
  label: string;
  value: number;
  sub: string;
  alert?: boolean;
  last?: boolean;
}) {
  return (
    <div className={`px-5 py-4 ${last ? '' : 'sm:border-r sm:border-zinc-100'}`}>
      <p className="text-[13px] text-zinc-500">{label}</p>
      <p className={`text-[28px] font-extrabold leading-tight tabular-nums ${alert ? 'text-red-600' : 'text-zinc-900'}`}>
        {value}
      </p>
      <p className="text-xs text-zinc-400">{sub}</p>
    </div>
  );
}

function avgBarColor(pct: number): string {
  if (pct < 70) return 'bg-red-500';
  if (pct < 75) return 'bg-amber-500';
  return 'bg-green-500';
}

function HealthRow({ card, color }: { card: ClassHealthCard; color?: string }) {
  const c = card.class;
  const href = `/teacher/classes/${c.id}?tab=analytics`;
  const avg = card.classAvgPct;
  const meta = [c.section, `${card.studentCount} ${card.studentCount === 1 ? 'student' : 'students'}`]
    .filter(Boolean)
    .join(' · ');

  const count = (n: number, tone: string) => (
    <span className={`font-bold tabular-nums ${n > 0 ? tone : 'text-zinc-300'}`}>{n}</span>
  );

  return (
    <tr className="group relative transition hover:bg-zinc-50/70">
      <td className="px-5 py-3.5">
        <Link href={href} className="flex items-center gap-2.5 after:absolute after:inset-0 after:content-['']">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color ?? DEFAULT_CLASS_COLOR }} />
          <span className="min-w-0">
            <span className="block truncate font-bold text-zinc-900 group-hover:text-red-700">{c.name}</span>
            <span className="block truncate text-xs text-zinc-400">{meta}</span>
          </span>
        </Link>
      </td>
      <td className="px-3 py-3.5">
        {avg === null ? (
          <span className="text-xs text-zinc-400">No grades yet</span>
        ) : (
          <div className="flex min-w-[160px] items-center gap-2.5">
            <span className="w-12 font-extrabold tabular-nums text-zinc-900">{avg.toFixed(1)}%</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
              <span
                className={`block h-full rounded-full ${avgBarColor(avg)}`}
                style={{ width: `${Math.max(2, Math.min(100, avg))}%` }}
              />
            </span>
          </div>
        )}
      </td>
      <td className="px-3 py-3.5 text-center">{count(card.atRiskCount, 'text-red-600')}</td>
      <td className="px-3 py-3.5 text-center">{count(card.watchCount, 'text-amber-600')}</td>
      <td className="px-3 py-3.5 text-center">{count(card.safeCount, 'text-green-600')}</td>
      <td className="px-5 py-3.5 text-right">
        <ChevronRight className="ml-auto h-4 w-4 text-zinc-300" />
      </td>
    </tr>
  );
}

function StudentRow({ row, colorById }: { row: AtRiskStudentRow; colorById: Map<string, string> }) {
  const uniqueReasons = Array.from(new Set(row.memberships.flatMap((m) => m.riskReasons)));

  return (
    <tr className="transition hover:bg-zinc-50/70">
      <td className="px-5 py-3.5 align-top">
        <div className="font-semibold text-zinc-900">{row.fullName ?? 'Unknown'}</div>
        <div className="max-w-[260px] truncate text-xs text-zinc-400">{row.email}</div>
      </td>
      <td className="px-3 py-3.5 align-top">
        <div className="flex flex-wrap gap-1.5">
          {row.memberships.map((m) => (
            <Link
              key={m.classId}
              href={`/teacher/classes/${m.classId}?tab=analytics`}
              title={`${m.className} — ${m.risk === 'at_risk' ? 'At-risk' : 'Watch'}`}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold transition hover:opacity-80 ${
                m.risk === 'at_risk' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
              }`}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorById.get(m.classId) ?? DEFAULT_CLASS_COLOR }}
              />
              {m.risk === 'at_risk' && <AlertTriangle className="h-3 w-3" />}
              <span className="max-w-[14ch] truncate">{m.className}</span>
              <TrendIcon trend={m.trend} />
            </Link>
          ))}
        </div>
      </td>
      <td className="px-3 py-3.5 align-top font-extrabold tabular-nums text-zinc-900">
        {row.worstAvgPct === null ? '—' : `${row.worstAvgPct.toFixed(1)}%`}
      </td>
      <td className="px-5 py-3.5 align-top text-[13px] text-zinc-600">
        {uniqueReasons.length === 0 ? (
          <span className="text-zinc-300">—</span>
        ) : (
          <ul className="space-y-0.5">
            {uniqueReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}

function TrendIcon({ trend }: { trend: 'improving' | 'stable' | 'declining' | 'insufficient_data' }) {
  if (trend === 'declining') return <TrendingDown className="h-3 w-3" aria-label="Trend: declining" />;
  if (trend === 'improving') return <TrendingUp className="h-3 w-3" aria-label="Trend: improving" />;
  if (trend === 'stable') return <Minus className="h-3 w-3" aria-label="Trend: stable" />;
  return null;
}