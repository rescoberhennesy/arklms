'use client';

import { useState } from 'react';
import {
  Award,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Clock,
  CheckCircle2,
  CircleDashed,
} from 'lucide-react';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import { MODULE_TERMS, MODULE_TERM_LABELS } from '@/lib/types/modules';
import type { ModuleTerm } from '@/lib/types/modules';
import type {
  StudentGradebookView as StudentGradebookViewData,
  StudentGradebookCell,
} from '@/lib/actions/gradebook';

interface StudentGradebookViewProps {
  view: StudentGradebookViewData;
}

const TERM_ACCENTS: Record<ModuleTerm, string> = {
  prelim: 'border-blue-200 bg-blue-50',
  midterm: 'border-purple-200 bg-purple-50',
  prefinal: 'border-amber-200 bg-amber-50',
  final: 'border-rose-200 bg-rose-50',
};

const TERM_TEXT_ACCENTS: Record<ModuleTerm, string> = {
  prelim: 'text-blue-800',
  midterm: 'text-purple-800',
  prefinal: 'text-amber-800',
  final: 'text-rose-800',
};

function fmtPct(p: number | null): string {
  if (p === null) return '—';
  return `${p.toFixed(1)}%`;
}

function statusPill(cell: StudentGradebookCell): {
  label: string;
  className: string;
  icon: React.ReactNode;
} {
  switch (cell.status) {
    case 'graded':
      return {
        label: 'Graded',
        className: 'bg-green-100 text-green-800',
        icon: <CheckCircle2 className="h-3 w-3" />,
      };
    case 'submitted_pending':
      return {
        label: cell.isLate ? 'Submitted (late)' : 'Submitted',
        className: cell.isLate
          ? 'bg-amber-100 text-amber-800'
          : 'bg-blue-100 text-blue-800',
        icon: <Clock className="h-3 w-3" />,
      };
    case 'missing':
      return {
        label: 'Missing',
        className: 'bg-red-100 text-red-800',
        icon: <AlertCircle className="h-3 w-3" />,
      };
    case 'late_window':
      return {
        label: 'Late accepted',
        className: 'bg-amber-100 text-amber-800',
        icon: <Clock className="h-3 w-3" />,
      };
    case 'open':
    default:
      return {
        label: 'Open',
        className: 'bg-gray-100 text-gray-700',
        icon: <CircleDashed className="h-3 w-3" />,
      };
  }
}

export default function StudentGradebookView({
  view,
}: StudentGradebookViewProps) {
  const nonEmptyTerms = MODULE_TERMS.filter(
    (t) => view.termCells[t].length > 0,
  );

  if (nonEmptyTerms.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
        <h2 className="text-lg font-semibold text-gray-900">
          No activities yet
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Once your teacher posts activities, your grades will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Final grade summary */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Award className="h-4 w-4" />
              {view.isWeighted ? 'Final grade (weighted)' : 'Final grade'}
            </div>
            <div className="mt-1 text-4xl font-bold text-gray-900">
              {fmtPct(view.finalPercent)}
            </div>
            {view.finalPercent === null && (
              <div className="mt-1 text-xs text-gray-500">
                No grades released yet.
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {nonEmptyTerms.map((t) => {
              const weightPct = view.weights
                ? t === 'prelim'
                  ? view.weights.prelimPct
                  : t === 'midterm'
                    ? view.weights.midtermPct
                    : t === 'prefinal'
                      ? view.weights.prefinalPct
                      : view.weights.finalPct
                : null;
              return (
                <div
                  key={t}
                  className={`rounded-md border px-3 py-1.5 ${TERM_ACCENTS[t]}`}
                >
                  <div
                    className={`text-[10px] font-semibold uppercase tracking-wide ${TERM_TEXT_ACCENTS[t]}`}
                  >
                    {MODULE_TERM_LABELS[t]}
                    {view.isWeighted && weightPct !== null && ` · ${weightPct}%`}
                  </div>
                  <div
                    className={`mt-0.5 text-base font-semibold ${TERM_TEXT_ACCENTS[t]}`}
                  >
                    {fmtPct(view.termPercents[t])}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Per-term cards */}
      {nonEmptyTerms.map((term) => (
        <TermCard
          key={term}
          term={term}
          cells={view.termCells[term]}
          termPercent={view.termPercents[term]}
        />
      ))}
    </div>
  );
}

interface TermCardProps {
  term: ModuleTerm;
  cells: StudentGradebookCell[];
  termPercent: number | null;
}

function TermCard({ term, cells, termPercent }: TermCardProps) {
  return (
    <div className={`overflow-hidden rounded-xl border ${TERM_ACCENTS[term]}`}>
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
        <h3
          className={`text-sm font-semibold uppercase tracking-wide ${TERM_TEXT_ACCENTS[term]}`}
        >
          {MODULE_TERM_LABELS[term]}
        </h3>
        <div className={`text-sm font-semibold ${TERM_TEXT_ACCENTS[term]}`}>
          {fmtPct(termPercent)}
        </div>
      </div>
      <ul className="divide-y divide-gray-100 bg-white">
        {cells.map((cell) => (
          <ActivityRow key={cell.activityId} cell={cell} />
        ))}
      </ul>
    </div>
  );
}

interface ActivityRowProps {
  cell: StudentGradebookCell;
}

function ActivityRow({ cell }: ActivityRowProps) {
  const [expanded, setExpanded] = useState(false);
  const pill = statusPill(cell);
  const hasFeedback =
    cell.status === 'graded' && (cell.feedback ?? '').trim() !== '';

  return (
    <li>
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-900">
            {cell.title}
          </div>
          <div className="mt-0.5 text-xs text-gray-500">
            Due {new Date(cell.dueAt).toLocaleString()}
          </div>
        </div>

        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${pill.className}`}
        >
          {pill.icon}
          {pill.label}
        </span>

        <div className="w-24 shrink-0 text-right text-sm">
          {cell.status === 'graded' ? (
            <span>
              <span className="font-semibold text-gray-900">{cell.score}</span>
              <span className="text-gray-400"> / {cell.maxPoints}</span>
            </span>
          ) : (
            <span className="text-gray-400">— / {cell.maxPoints}</span>
          )}
        </div>

        {hasFeedback && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label={expanded ? 'Hide feedback' : 'Show feedback'}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {hasFeedback && expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-3">
          <div className="mb-1 text-xs font-semibold text-gray-700">
            Feedback
          </div>
          <MarkdownContent body={cell.feedback as string} />
        </div>
      )}
    </li>
  );
}