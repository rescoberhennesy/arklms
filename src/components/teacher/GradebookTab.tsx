'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Scale, Download, Loader2, Filter } from 'lucide-react';
import { exportGradebookToBase64 } from '@/lib/actions/gradebook';
import type {
  GradebookView,
  GradebookCell,
} from '@/lib/actions/gradebook';
import { MODULE_TERMS, MODULE_TERM_LABELS } from '@/lib/types/modules';
import GradeWeightsModal from '@/components/teacher/GradeWeightsModal';

interface GradebookTabProps {
  view: GradebookView;
  classId: string;
}

type FilterMode = 'all' | 'has_ungraded' | 'has_missing';

const FILTER_LABELS: Record<FilterMode, string> = {
  all: 'All students',
  has_ungraded: 'Has ungraded',
  has_missing: 'Has missing',
};

function cellTextAndClass(cell: GradebookCell): {
  label: string;
  className: string;
} {
  switch (cell.status) {
    case 'graded_released':
      return {
        label: `${cell.score} / ${cell.maxPoints}`,
        className: 'bg-green-50 text-green-900',
      };
    case 'graded_unreleased':
      return {
        label: `${cell.score} / ${cell.maxPoints}`,
        className: 'bg-purple-50 text-purple-900',
      };
    case 'submitted_ungraded':
      return {
        label: cell.isLate ? 'Late' : 'Submitted',
        className: cell.isLate
          ? 'bg-amber-50 text-amber-900'
          : 'bg-blue-50 text-blue-900',
      };
    case 'missing':
      return { label: 'Missing', className: 'bg-red-50 text-red-900' };
    case 'late_window':
      return { label: '—', className: 'text-gray-400' };
    case 'draft_activity':
      return { label: '—', className: 'text-gray-300' };
    case 'not_due_yet':
    case 'open':
    default:
      return { label: '—', className: 'text-gray-400' };
  }
}

function fmtPct(p: number | null): string {
  if (p === null) return '—';
  return `${p.toFixed(1)}%`;
}

// Triggers a browser download from a base64 string.
function downloadBase64(base64: string, fileName: string, mime: string) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function GradebookTab({ view, classId }: GradebookTabProps) {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [exportPending, startExport] = useTransition();
  const [exportError, setExportError] = useState<string | null>(null);

  const filteredStudents = useMemo(() => {
    if (filter === 'all') return view.students;
    if (filter === 'has_ungraded') {
      return view.students.filter((s) => s.hasUngraded);
    }
    return view.students.filter((s) => s.hasMissing);
  }, [view.students, filter]);

  function handleExport() {
    setExportError(null);
    startExport(async () => {
      try {
        const { base64, fileName } = await exportGradebookToBase64(classId);
        downloadBase64(
          base64,
          fileName,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
      } catch (err) {
        setExportError(err instanceof Error ? err.message : 'Export failed');
      }
    });
  }

  const finalLabel = view.isWeighted ? 'Final (weighted)' : 'Final (unweighted)';

  // Empty state
  if (view.students.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
        No students enrolled in this class yet.
      </div>
    );
  }
  if (view.activitiesOrdered.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
        No activities yet. Create one in the Activities tab to start grading.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterMode)}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          >
            {(Object.keys(FILTER_LABELS) as FilterMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {FILTER_LABELS[mode]}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-500">
            {filteredStudents.length} of {view.students.length} students
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeightsOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Scale className="h-4 w-4" />
            {view.isWeighted ? 'Configure weights' : 'Set weights'}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exportPending}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {exportPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export to Excel
          </button>
        </div>
      </div>

      {exportError && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
          {exportError}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            {/* Term span row */}
            <tr className="border-b border-gray-200 bg-gray-50">
              <th
                rowSpan={2}
                className="sticky left-0 z-10 min-w-[180px] border-r border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-700"
              >
                Student
              </th>
              {MODULE_TERMS.map((term) => {
                const acts = view.activitiesByTerm[term];
                if (acts.length === 0) return null;
                return (
                  <th
                    key={term}
                    colSpan={acts.length + 1}
                    className="border-b border-r border-gray-200 px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-700"
                  >
                    {MODULE_TERM_LABELS[term]}
                  </th>
                );
              })}
              <th
                rowSpan={2}
                className="border-l border-gray-200 px-3 py-2 text-center text-xs font-semibold text-gray-700"
              >
                {finalLabel}
              </th>
            </tr>
            {/* Activity row + per-term subtotal */}
            <tr className="border-b border-gray-200 bg-gray-50">
              {MODULE_TERMS.flatMap((term) => {
                const acts = view.activitiesByTerm[term];
                if (acts.length === 0) return [];
                const headers = acts.map((a) => (
                  <th
                    key={a.id}
                    className="min-w-[110px] border-l border-gray-200 px-2 py-1.5 text-left text-xs font-medium text-gray-600"
                  >
                    <div className="truncate" title={a.title}>
                      {a.title}
                      {!a.published && (
                        <span className="ml-1 rounded bg-gray-200 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                          Draft
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      / {a.maxPoints}
                    </div>
                  </th>
                ));
                headers.push(
                  <th
                    key={`${term}-subtotal`}
                    className="border-l border-r border-gray-200 bg-gray-100 px-2 py-1.5 text-center text-xs font-semibold text-gray-700"
                  >
                    Subtotal
                  </th>,
                );
                return headers;
              })}
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((s) => (
              <tr
                key={s.studentId}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-[180px] border-r border-gray-200 bg-white px-3 py-2 text-left align-top font-medium text-gray-900"
                >
                  <div className="truncate">{s.fullName ?? 'Unknown'}</div>
                  <div className="truncate text-xs font-normal text-gray-500">
                    {s.email}
                  </div>
                </th>
                {MODULE_TERMS.flatMap((term) => {
                  const acts = view.activitiesByTerm[term];
                  if (acts.length === 0) return [];
                  const cells = acts.map((a) => {
                    const cell = s.cells[a.id];
                    const { label, className } = cellTextAndClass(cell);
                    const inner = (
                      <span
                        className={`block w-full rounded px-1 py-0.5 text-xs ${className}`}
                      >
                        {label}
                      </span>
                    );
                    return (
                      <td
                        key={a.id}
                        className="border-l border-gray-100 px-2 py-1 align-middle"
                      >
                        {cell.submissionId ? (
                          <Link
                            href={`/teacher/classes/${classId}/activities/${a.id}/submissions/${cell.submissionId}`}
                            className="block hover:underline"
                          >
                            {inner}
                          </Link>
                        ) : (
                          inner
                        )}
                      </td>
                    );
                  });
                  cells.push(
                    <td
                      key={`${term}-subtotal-${s.studentId}`}
                      className="border-l border-r border-gray-200 bg-gray-50 px-2 py-1 text-center text-xs font-semibold text-gray-700"
                    >
                      {fmtPct(s.termPercents[term])}
                    </td>,
                  );
                  return cells;
                })}
                <td className="border-l border-gray-200 px-3 py-1 text-center text-sm font-semibold text-gray-900">
                  {fmtPct(s.finalPercent)}
                </td>
              </tr>
            ))}
            {filteredStudents.length === 0 && (
              <tr>
                <td
                  colSpan={
                    1 +
                    view.activitiesOrdered.length +
                    MODULE_TERMS.filter(
                      (t) => view.activitiesByTerm[t].length > 0,
                    ).length +
                    1
                  }
                  className="px-4 py-6 text-center text-sm text-gray-500"
                >
                  No students match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <GradeWeightsModal
        open={weightsOpen}
        classId={classId}
        weights={view.weights}
        onClose={() => setWeightsOpen(false)}
      />
    </div>
  );
}