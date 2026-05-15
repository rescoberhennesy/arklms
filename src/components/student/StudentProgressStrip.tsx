
// src/components/student/StudentProgressStrip.tsx
import { Trophy } from 'lucide-react';
import ProgressBar from '@/components/dashboard/ProgressBar';
import { getStudentClassProgress } from '@/lib/actions/progress';
import {
  MODULE_TERM_LABELS,
  type ModuleTerm,
} from '@/lib/types/modules';

interface StudentProgressStripProps {
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

export default async function StudentProgressStrip({
  classId,
}: StudentProgressStripProps) {
  const progress = await getStudentClassProgress(classId);

  const { overall, byTerm } = progress;
  const overallPct =
    overall.total === 0
      ? 0
      : Math.round((overall.done / overall.total) * 100);

  // If teacher hasn't published any activities yet, hide the strip entirely.
  if (overall.total === 0) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          <Trophy className="h-4 w-4 text-amber-500" />
          Your progress
        </h2>
        <span className="text-xs text-gray-600">
          {overall.done} of {overall.total} activities submitted ·{' '}
          <span className="font-semibold text-green-700">{overallPct}%</span>
        </span>
      </div>

      {/* Overall bar */}
      <ProgressBar
        done={overall.done}
        total={overall.total}
        showPercent={false}
        showCount={false}
        size="md"
        accent="green"
      />

      {/* Per-term grid */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {byTerm.map((t) => (
          <ProgressBar
            key={t.term}
            label={MODULE_TERM_LABELS[t.term]}
            done={t.done}
            total={t.total}
            size="sm"
            accent={TERM_ACCENT[t.term]}
          />
        ))}
      </div>
    </section>
  );
}
