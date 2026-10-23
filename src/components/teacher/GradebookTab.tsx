'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Scale, Download, Loader2 } from 'lucide-react';
import { exportGradebookToBase64 } from '@/lib/actions/gradebook';
import type { GradebookView, GradebookCell } from '@/lib/actions/gradebook';
import { MODULE_TERMS, MODULE_TERM_LABELS, type ModuleTerm } from '@/lib/types/modules';
import GradeWeightsModal from '@/components/teacher/GradeWeightsModal';
import { formatGrade, standingOf, type GradingMethod, type Standing } from '@/lib/utils/grading';

interface GradebookTabProps {
  view: GradebookView;
  classId: string;
}

type TabKey = 'overview' | ModuleTerm;
type FilterMode = 'all' | 'risk' | 'has_ungraded' | 'has_missing';

const STANDING_CLS: Record<Standing, string> = {
  pass: 'bg-emerald-50 text-emerald-700',
  near: 'bg-amber-50 text-amber-700',
  risk: 'bg-red-50 text-red-700',
};
const STANDING_LABEL: Record<Standing, string> = {
  pass: 'Passing',
  near: 'Near passing',
  risk: 'At risk',
};
const MUTED = 'bg-zinc-50 text-zinc-400';

function downloadBase64(base64: string, fileName: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function GradebookTab({ view, classId }: GradebookTabProps) {
  const [tab, setTab] = useState<TabKey>('overview');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [exportPending, startExport] = useTransition();
  const [exportError, setExportError] = useState<string | null>(null);

  const w = view.weights;
  const method: GradingMethod = w?.gradingMethod ?? 'raw';
  const passing = w?.passingGrade ?? 75;
  const terms = MODULE_TERMS.filter((t) => t !== 'prefinal');
  const termsWithActivities = terms.filter((t) => view.activitiesByTerm[t].length > 0);

  // Which terms actually have released grades for anyone
  const gradedTerms = terms.filter((t) => view.students.some((s) => s.termPercents[t] !== null));
  const weightedTerms = w
    ? terms.filter((t) => ({ prelim: w.prelimPct, midterm: w.midtermPct, prefinal: 0, final: w.finalPct })[t] > 0)
    : terms;
  const isComplete = weightedTerms.every((t) => gradedTerms.includes(t));
  const gradeLabel = isComplete ? 'Final grade' : 'Current grade';

  // Item-level standing uses the raw % of that item (items aren't transmuted)
  function itemStanding(score: number, max: number): Standing {
    const pct = max > 0 ? (score / max) * 100 : 0;
    return standingOf(method === 'deped' ? 75 + Math.max(0, pct - 60) / 1.6 : pct, passing);
  }

  const toGradeCount = view.students.reduce(
    (n, s) => n + Object.values(s.cells).filter((c) => c.status === 'submitted_ungraded').length,
    0,
  );
  const finals = view.students.map((s) => s.finalPercent).filter((v): v is number => v !== null);
  const average = finals.length ? finals.reduce((a, b) => a + b, 0) / finals.length : null;
  const passCount = finals.filter((v) => standingOf(v, passing) === 'pass').length;
  const riskCount = finals.filter((v) => standingOf(v, passing) === 'risk').length;

  const students = useMemo(() => {
    return view.students.filter((s) => {
      if (filter === 'has_ungraded') return s.hasUngraded;
      if (filter === 'has_missing') return s.hasMissing;
      if (filter === 'risk') return s.finalPercent !== null && standingOf(s.finalPercent, passing) !== 'pass';
      return true;
    });
  }, [view.students, filter, passing]);

  function handleExport() {
    setExportError(null);
    startExport(async () => {
      try {
        const { base64, fileName } = await exportGradebookToBase64(classId);
        downloadBase64(base64, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } catch (err) {
        setExportError(err instanceof Error ? err.message : 'Export failed');
      }
    });
  }

  if (view.students.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
        No students enrolled in this class yet.
      </div>
    );
  }
  if (view.activitiesOrdered.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
        No activities yet. Create one in the Activities tab to start grading.
      </div>
    );
  }

  const weightsText = w
    ? `${MODULE_TERM_LABELS.prelim} ${w.prelimPct}% · ${MODULE_TERM_LABELS.midterm} ${w.midtermPct}% · ${MODULE_TERM_LABELS.final} ${w.finalPct}%`
    : 'No weights set yet (terms count equally)';
  const card = 'rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-2xl bg-zinc-100 p-1">
          {(['overview', ...termsWithActivities] as TabKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`inline-flex min-h-10 items-center rounded-xl px-5 text-sm transition ${
                tab === k
                  ? 'bg-white font-bold text-red-700 shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                  : 'font-semibold text-zinc-500 hover:text-zinc-900'
              }`}
            >
              {k === 'overview' ? 'Overview' : MODULE_TERM_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setWeightsOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            <Scale className="h-4 w-4" />
            Grading settings
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exportPending}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-bold text-white shadow-[0_6px_16px_rgba(220,38,38,0.22)] hover:bg-red-700 disabled:opacity-60"
          >
            {exportPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export to Excel
          </button>
        </div>
      </div>

      {exportError && <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{exportError}</div>}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Class average" value={formatGrade(average, method)} />
        <Stat label={`Passing (${passing}+)`} value={String(passCount)} tone="text-emerald-700" />
        <Stat label="At risk" value={String(riskCount)} tone={riskCount > 0 ? 'text-red-600' : undefined} />
        <Stat label="To grade" value={String(toGradeCount)} tone={toGradeCount > 0 ? 'text-red-600' : undefined} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          {weightsText} · {method === 'deped' ? 'DepEd transmutation' : 'Raw percentage'}
          {!isComplete && gradedTerms.length > 0 && (
            <span className="font-semibold text-amber-700">
              {' '}
              · Current grade is based on {gradedTerms.map((t) => MODULE_TERM_LABELS[t]).join(' and ')} so far
            </span>
          )}
        </p>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterMode)}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-red-400 focus:outline-none"
        >
          <option value="all">All students ({view.students.length})</option>
          <option value="risk">Not passing</option>
          <option value="has_ungraded">Has ungraded work</option>
          <option value="has_missing">Has missing work</option>
        </select>
      </div>

      {/* Table */}
      <div className={`${card} overflow-x-auto`}>
        {tab === 'overview' ? (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/60 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <th className="sticky left-0 bg-zinc-50 px-4 py-3">Student</th>
                {terms.map((t) => (
                  <th key={t} className="px-3 py-3 text-center">
                    {MODULE_TERM_LABELS[t]}
                  </th>
                ))}
                <th className="px-3 py-3 text-center">{gradeLabel}</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {students.map((s) => {
                const st = s.finalPercent !== null ? standingOf(s.finalPercent, passing) : null;
                return (
                  <tr key={s.studentId} className="hover:bg-zinc-50/60">
                    <td className="sticky left-0 bg-white px-4 py-3">
                      <p className="font-semibold text-zinc-900">{s.fullName ?? 'Unknown'}</p>
                      <p className="text-xs text-zinc-500">{s.email}</p>
                    </td>
                    {terms.map((t) => {
                      const v = s.termPercents[t];
                      return (
                        <td key={t} className="px-3 py-3 text-center">
                          <span
                            className={`inline-block min-w-[64px] rounded-lg px-2 py-1 text-xs font-semibold ${
                              v === null ? MUTED : STANDING_CLS[standingOf(v, passing)]
                            }`}
                          >
                            {formatGrade(v, method)}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-center text-base font-bold text-zinc-900">
                      {formatGrade(s.finalPercent, method)}
                    </td>
                    <td className="px-3 py-3">
                      {st && (
                        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${STANDING_CLS[st]}`}>
                          {STANDING_LABEL[st]}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/60 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <th className="sticky left-0 z-10 min-w-[180px] bg-zinc-50 px-4 py-3">Student</th>
                {view.activitiesByTerm[tab].map((a) => (
                  <th key={a.id} className="min-w-[120px] px-3 py-3 text-center normal-case tracking-normal">
                    <span className="block truncate text-xs font-semibold text-zinc-700" title={a.title}>
                      {a.title}
                    </span>
                    <span className="text-[11px] font-normal text-zinc-400">
                      / {a.maxPoints}
                      {!a.published && ' · draft'}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-3 text-center">{MODULE_TERM_LABELS[tab]}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {students.map((s) => (
                <tr key={s.studentId} className="hover:bg-zinc-50/60">
                  <td className="sticky left-0 z-10 bg-white px-4 py-3">
                    <p className="font-semibold text-zinc-900">{s.fullName ?? 'Unknown'}</p>
                  </td>
                  {view.activitiesByTerm[tab].map((a) => (
                    <td key={a.id} className="px-3 py-2 text-center">
                      <ScoreCell
                        cell={s.cells[a.id]}
                        href={
                          s.cells[a.id].submissionId
                            ? `/teacher/classes/${classId}/activities/${a.id}/submissions/${s.cells[a.id].submissionId}`
                            : null
                        }
                        standing={itemStanding}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center font-bold text-zinc-900">
                    {formatGrade(s.termPercents[tab], method)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {students.length === 0 && (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">No students match this filter.</p>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span>
          <span className={`rounded px-1.5 py-0.5 ${STANDING_CLS.pass}`}>Passing</span> {passing}+
        </span>
        <span>
          <span className={`rounded px-1.5 py-0.5 ${STANDING_CLS.near}`}>Near</span> {passing - 10}–{passing - 1}
        </span>
        <span>
          <span className={`rounded px-1.5 py-0.5 ${STANDING_CLS.risk}`}>At risk</span> below {passing - 10}
        </span>
        <span>
          <span className={`rounded px-1.5 py-0.5 ${MUTED}`}>—</span> no released grade yet
        </span>
      </div>

      <GradeWeightsModal open={weightsOpen} classId={classId} weights={view.weights} onClose={() => setWeightsOpen(false)} />
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

function ScoreCell({
  cell,
  href,
  standing,
}: {
  cell: GradebookCell;
  href: string | null;
  standing: (score: number, max: number) => Standing;
}) {
  let label: string;
  let cls: string;
  switch (cell.status) {
    case 'graded_released':
      label = `${cell.score}`;
      cls = STANDING_CLS[standing(cell.score ?? 0, cell.maxPoints)];
      break;
    case 'graded_unreleased':
      label = `${cell.score}`;
      cls = 'bg-purple-50 text-purple-700';
      break;
    case 'submitted_ungraded':
      label = cell.isLate ? 'Late' : 'To grade';
      cls = 'bg-blue-50 text-blue-700';
      break;
    case 'missing':
      label = 'Missing';
      cls = 'bg-red-50 text-red-700';
      break;
    default:
      label = '—';
      cls = MUTED;
  }
  const inner = (
    <span className={`inline-block min-w-[64px] rounded-lg px-2 py-1 text-xs font-semibold ${cls}`}>{label}</span>
  );
  return href ? (
    <Link href={href} className="hover:opacity-80">
      {inner}
    </Link>
  ) : (
    inner
  );
}