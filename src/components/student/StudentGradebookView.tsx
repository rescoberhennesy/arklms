'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import { MODULE_TERMS, MODULE_TERM_LABELS } from '@/lib/types/modules';
import type { ModuleTerm } from '@/lib/types/modules';
import type {
  StudentGradebookView as StudentGradebookViewData,
  StudentGradebookCell,
} from '@/lib/actions/gradebook';
import { cn } from '@/lib/utils/cn';

interface StudentGradebookViewProps {
  view: StudentGradebookViewData;
}

const CARD = 'rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]';
const ROW_GRID = 'md:grid md:grid-cols-[minmax(0,1fr)_140px_150px_110px_36px] md:items-center md:gap-4';

function fmtPct(p: number | null): string {
  if (p === null) return '—';
  return `${p.toFixed(1)}%`;
}

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function formatDueTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

function statusPill(cell: StudentGradebookCell): { label: string; className: string; dot: string } {
  switch (cell.status) {
    case 'graded':
      return { label: 'Graded', className: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' };
    case 'submitted_pending':
      return cell.isLate
        ? { label: 'Submitted late', className: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' }
        : { label: 'Submitted', className: 'bg-zinc-100 text-zinc-700', dot: 'bg-zinc-900' };
    case 'missing':
      return { label: 'Missing', className: 'bg-red-50 text-red-700', dot: 'bg-red-500' };
    case 'late_window':
      return { label: 'Late accepted', className: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' };
    case 'open':
    default:
      return { label: 'Open', className: 'bg-zinc-100 text-zinc-600', dot: 'bg-zinc-400' };
  }
}

function weightFor(view: StudentGradebookViewData, t: ModuleTerm): number | null {
  if (!view.weights) return null;
  return t === 'prelim'
    ? view.weights.prelimPct
    : t === 'midterm'
      ? view.weights.midtermPct
      : t === 'prefinal'
        ? view.weights.prefinalPct
        : view.weights.finalPct;
}

export default function StudentGradebookView({ view }: StudentGradebookViewProps) {
  const nonEmptyTerms = MODULE_TERMS.filter((t) => view.termCells[t].length > 0);
  const [activeTerm, setActiveTerm] = useState<ModuleTerm>(() => nonEmptyTerms[0] ?? 'prelim');

  if (nonEmptyTerms.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
        <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <BarChart3 className="h-6 w-6" />
        </span>
        <h2 className="text-base font-bold text-zinc-900">No activities yet</h2>
        <p className="text-sm text-zinc-500">Once your teacher posts activities, your grades will show up here.</p>
      </div>
    );
  }

  const allCells = MODULE_TERMS.flatMap((t) => view.termCells[t]);
  const gradedCount = allCells.filter((c) => c.status === 'graded').length;
  const cells = view.termCells[activeTerm];

  return (
    <div className="space-y-5">
      {/* Summary */}
      <section className={cn(CARD, 'flex flex-col gap-6 p-6 lg:flex-row lg:items-stretch')}>
        <div className="flex shrink-0 flex-col justify-center gap-1.5 lg:w-60">
          <span className="text-[13px] font-semibold text-zinc-500">
            {view.isWeighted ? 'Your current grade' : 'Your grade'}
          </span>
          <span className="text-5xl font-extrabold leading-none tracking-tight text-zinc-900">
            {fmtPct(view.finalPercent)}
          </span>
          <span className="text-[13px] text-zinc-500">
            {view.finalPercent === null
              ? 'No grades released yet.'
              : `${view.isWeighted ? 'Weighted across terms · ' : ''}${gradedCount} of ${allCells.length} graded`}
          </span>
        </div>

        <div className="hidden w-px bg-zinc-100 lg:block" />

        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          {MODULE_TERMS.map((t) => {
            const pct = view.termPercents[t];
            const weight = weightFor(view, t);
            const termCells = view.termCells[t];
            const graded = termCells.filter((c) => c.status === 'graded').length;
            const isActive = t === activeTerm;
            const hasCells = termCells.length > 0;
            return (
              <button
                key={t}
                type="button"
                
                onClick={() => setActiveTerm(t)}
                className={cn(
                  'flex flex-col gap-2 rounded-xl border px-4 py-3.5 text-left transition',
                  isActive ? 'border-red-200 bg-red-50/60' : 'border-zinc-200 bg-white',
                  !isActive && 'hover:border-zinc-300 hover:bg-zinc-50',
                  
                )}
              >
                <span className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="font-bold text-zinc-900">{MODULE_TERM_LABELS[t]}</span>
                  {view.isWeighted && weight !== null && <span className="text-zinc-500">{weight}% of grade</span>}
                </span>
                <span
                  className={cn(
                    'text-2xl font-extrabold tracking-tight',
                    pct === null ? 'text-zinc-300' : 'text-zinc-900',
                  )}
                >
                  {fmtPct(pct)}
                </span>
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                  {pct !== null && (
                    <span
                      className="block h-full rounded-full bg-red-600"
                      style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
                    />
                  )}
                </span>
                <span className="text-xs text-zinc-500">
                  {!hasCells
                    ? 'No activities yet'
                    : graded === 0
                      ? 'Nothing graded yet'
                      : `${graded} of ${termCells.length} graded`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Term table */}
      <section className={cn(CARD, 'overflow-hidden')}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div role="tablist" aria-label="Grading period" className="inline-flex rounded-xl border border-zinc-200 bg-white p-1">
            {MODULE_TERMS.map((t) => {
              const active = t === activeTerm;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTerm(t)}
                  className={cn(
                    'rounded-lg px-4 py-2 text-sm transition',
                    active
                      ? 'bg-red-600 font-semibold text-white shadow-[0_4px_12px_rgba(220,38,38,0.25)]'
                      : 'font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900',
                  )}
                >
                  {MODULE_TERM_LABELS[t]}
                </button>
              );
            })}
          </div>
          <span className="text-sm text-zinc-600">
            {MODULE_TERM_LABELS[activeTerm]} grade{' '}
            <b className="text-base font-bold text-zinc-900">{fmtPct(view.termPercents[activeTerm])}</b>
          </span>
        </div>

         {cells.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500">
            No activities in {MODULE_TERM_LABELS[activeTerm]} yet.
          </div>
        ) : (
        <>

        <div
          className={cn(
            'hidden border-b border-zinc-100 bg-zinc-50/60 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 md:grid',
            ROW_GRID,
          )}
        >
          <span>Activity</span>
          <span>Due</span>
          <span>Status</span>
          <span className="text-right">Score</span>
          <span className="sr-only">Feedback</span>
        </div>

        <ul className="divide-y divide-zinc-100">
          {cells.map((cell) => (
            <ActivityRow key={cell.activityId} cell={cell} />
          ))}
        </ul>
        </>
        )}
      </section>

      <p className="text-xs text-zinc-400">
        Only graded work counts toward your grade. Ungraded and upcoming activities aren&apos;t included yet.
      </p>
    </div>
  );
}

function ActivityRow({ cell }: { cell: StudentGradebookCell }) {
  const [expanded, setExpanded] = useState(false);
  const pill = statusPill(cell);
  const hasFeedback = cell.status === 'graded' && (cell.feedback ?? '').trim() !== '';
  const isGraded = cell.status === 'graded' && cell.score !== null && cell.score !== undefined;
  const pct = isGraded && cell.maxPoints > 0 ? Math.round((Number(cell.score) / cell.maxPoints) * 100) : null;

  return (
    <li className={cn(expanded && 'bg-zinc-50/50')}>
      <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4', ROW_GRID)}>
        {/* Title */}
        <div className="min-w-0 basis-full md:basis-auto">
          <p className="truncate text-[15px] font-semibold text-zinc-900">{cell.title}</p>
          <p className="mt-0.5 text-[13px] text-zinc-500">{cell.maxPoints} pts</p>
        </div>

        {/* Due */}
        <div className="text-[13px]">
          <span className="font-medium text-zinc-800">{formatDueDate(cell.dueAt)}</span>
          <span className="ml-1 text-zinc-500 md:ml-0 md:block">{formatDueTime(cell.dueAt)}</span>
        </div>

        {/* Status */}
        <div>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', pill.className)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', pill.dot)} />
            {pill.label}
          </span>
        </div>

        {/* Score */}
        <div className="ml-auto text-right md:ml-0">
          {isGraded ? (
            <>
              <p className="text-[15px] font-bold text-zinc-900">
                {cell.score}
                <span className="font-normal text-zinc-400"> / {cell.maxPoints}</span>
              </p>
              {pct !== null && (
                <p className={cn('text-xs font-semibold', pct < 75 ? 'text-red-600' : 'text-zinc-500')}>{pct}%</p>
              )}
            </>
          ) : (
            <>
              <p className="text-[15px] text-zinc-400">— / {cell.maxPoints}</p>
              {cell.status === 'submitted_pending' && <p className="text-xs text-zinc-400">Waiting for grade</p>}
            </>
          )}
        </div>

        {/* Feedback toggle */}
        <div className="flex justify-end">
          {hasFeedback && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg transition',
                expanded ? 'bg-zinc-200/70 text-zinc-800' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800',
              )}
              aria-label={expanded ? 'Hide feedback' : 'Show feedback'}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {hasFeedback && expanded && (
        <div className="px-5 pb-4">
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3.5">
            <p className="mb-1.5 text-xs font-bold text-zinc-500">Teacher feedback</p>
            <MarkdownContent body={cell.feedback as string} />
          </div>
        </div>
      )}
    </li>
  );
}