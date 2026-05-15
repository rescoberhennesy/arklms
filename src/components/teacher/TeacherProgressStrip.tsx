
// src/components/teacher/TeacherProgressStrip.tsx
import { Users, BarChart3 } from 'lucide-react';
import ProgressBar from '@/components/dashboard/ProgressBar';
import { getTeacherClassProgress } from '@/lib/actions/progress';
import {
  MODULE_TERM_LABELS,
  type ModuleTerm,
} from '@/lib/types/modules';

interface TeacherProgressStripProps {
  classId: string;
}

const TERM_ACCENT: Record<
  ModuleTerm,
  'blue' | 'purple' | 'amber' | 'rose'
> = {
  prelim: 'blue',
  midterm: 'purple',
  prefinal: 'amber',
  final: 'rose',
};

export default async function TeacherProgressStrip({
  classId,
}: TeacherProgressStripProps) {
  const progress = await getTeacherClassProgress(classId);

  const { enrolledStudents, overall, byTerm } = progress;

  // Hide if no published activities — nothing to summarize yet.
  if (overall.totalActivities === 0) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          <BarChart3 className="h-4 w-4 text-indigo-500" />
          Class submission overview
        </h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
          <Users className="h-3 w-3" />
          {enrolledStudents} student{enrolledStudents === 1 ? '' : 's'} ·{' '}
          {overall.totalActivities} published{' '}
          {overall.totalActivities === 1 ? 'activity' : 'activities'} ·{' '}
          <span className="font-semibold text-indigo-700">
            {overall.avgCompletionPct}%
          </span>{' '}
          avg completion
        </span>
      </div>

      {/* Overall bar (avg across all submissions / possible submissions) */}
      <ProgressBar
        done={overall.avgCompletionPct}
        total={100}
        showPercent={false}
        showCount={false}
        size="md"
        accent="green"
      />

      {/* Per-term grid */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {byTerm.map((t) => (
          <div key={t.term} className="min-w-0">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span
                className={`font-medium ${
                  TERM_ACCENT[t.term] === 'blue'
                    ? 'text-blue-700'
                    : TERM_ACCENT[t.term] === 'purple'
                      ? 'text-purple-700'
                      : TERM_ACCENT[t.term] === 'amber'
                        ? 'text-amber-700'
                        : 'text-rose-700'
                }`}
              >
                {MODULE_TERM_LABELS[t.term]}
              </span>
              <span className="text-gray-600">
                {t.totalActivities === 0
                  ? '—'
                  : `${t.avgCompletionPct}%`}
              </span>
            </div>
            <ProgressBar
              done={t.avgCompletionPct}
              total={100}
              showCount={false}
              showPercent={false}
              size="sm"
              accent={TERM_ACCENT[t.term]}
            />
            <p className="mt-1 text-[11px] text-gray-500">
              {t.totalActivities === 0
                ? 'No activities yet'
                : `${t.totalSubmissions} / ${t.possibleSubmissions} submissions`}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
