// src/components/teacher/TeacherProgressStrip.tsx
// Right-side panels on the class Activities tab: Submission overview + Due soon.
import Link from 'next/link';
import { getTeacherClassProgress } from '@/lib/actions/progress';
import type { ActivityWithAllSubmissions } from '@/lib/types/activities';

interface TeacherProgressStripProps {
  classId: string;
  /** Optional: enables the "To grade" stat and the "Due soon" list. */
  activities?: ActivityWithAllSubmissions[];
}

const CARD =
  'rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function CompletionRing({ pct }: { pct: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <svg role="img" aria-label={`Average completion ${pct} percent`} width="84" height="84" viewBox="0 0 84 84">
      <circle cx="42" cy="42" r={r} fill="none" stroke="#f4f4f5" strokeWidth="7" />
      {pct > 0 && (
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke="#dc2626"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          transform="rotate(-90 42 42)"
        />
      )}
      <text x="42" y="47" textAnchor="middle" fontSize="17" fontWeight="700" fill="#18181b">
        {pct}%
      </text>
    </svg>
  );
}

function Row({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-zinc-100 py-2.5 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className={alert ? 'font-semibold text-red-600' : 'font-semibold text-zinc-900'}>{value}</span>
    </div>
  );
}

export default async function TeacherProgressStrip({ classId, activities }: TeacherProgressStripProps) {
  const { enrolledStudents, overall } = await getTeacherClassProgress(classId);

  if (overall.totalActivities === 0) {
    return (
      <section className={CARD}>
        <h2 className="text-[15px] font-bold text-zinc-900">Submission overview</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Publish an activity or quiz to see how your class is doing here.
        </p>
      </section>
    );
  }

  const published = (activities ?? []).filter((a) => a.published);
  const toGrade = published.reduce(
    (acc, a) => acc + a.submissions.filter((s) => s.grade === null).length,
    0,
  );
  const now = Date.now();
  const dueSoon = published
    .filter((a) => new Date(a.dueAt).getTime() > now)
    .sort((x, y) => new Date(x.dueAt).getTime() - new Date(y.dueAt).getTime())
    .slice(0, 3)
    .map((a) => {
      const submitted = new Set(a.submissions.map((s) => s.studentId)).size;
      return { ...a, missing: Math.max(0, enrolledStudents - submitted) };
    });

  return (
    <div className="space-y-4">
      <section className={CARD}>
        <h2 className="text-[15px] font-bold text-zinc-900">Submission overview</h2>
        <div className="flex items-center gap-4 pb-4 pt-4">
          <CompletionRing pct={overall.avgCompletionPct} />
          <div>
            <p className="text-sm font-semibold text-zinc-900">Average completion</p>
            <p className="text-xs text-zinc-400">Across published activities</p>
          </div>
        </div>
        <Row label={enrolledStudents === 1 ? 'Student' : 'Students'} value={enrolledStudents} />
        <Row label="Published" value={overall.totalActivities} />
        {activities && <Row label="To grade" value={toGrade} alert={toGrade > 0} />}
      </section>

      {activities && dueSoon.length > 0 && (
        <section className={CARD}>
          <h2 className="mb-1 text-[15px] font-bold text-zinc-900">Due soon</h2>
          <ul>
            {dueSoon.map((a) => (
              <li key={a.id} className="border-t border-zinc-100 first:border-t-0">
                <Link
                  href={`/teacher/classes/${classId}/activities/${a.id}`}
                  className="flex items-start justify-between gap-3 py-2.5 text-sm hover:text-red-600"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-zinc-900">{a.title}</span>
                    <span className="text-xs text-zinc-400">
                      {a.missing === 0 ? 'Everyone submitted' : `${a.missing} not submitted yet`}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-zinc-500">
                    {formatShortDate(a.dueAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}