// src/components/teacher/TeacherProgressStrip.tsx
// Right-side "Submission overview" panel on the class Activities tab.
import Link from 'next/link';
import { getTeacherClassProgress } from '@/lib/actions/progress';
import { MODULE_TERMS, MODULE_TERM_LABELS, type ModuleTerm } from '@/lib/types/modules';
import type { ActivityWithAllSubmissions } from '@/lib/types/activities';

interface TeacherProgressStripProps {
  classId: string;
  /** Optional: enables the "To grade" stat and the "Due soon" list. */
  activities?: ActivityWithAllSubmissions[];
}

const TERM_TEXT: Record<ModuleTerm, string> = {
  prelim: 'text-blue-700',
  midterm: 'text-purple-700',
  prefinal: 'text-amber-700',
  final: 'text-rose-700',
};

const TERM_BAR: Record<ModuleTerm, string> = {
  prelim: 'bg-blue-500',
  midterm: 'bg-purple-500',
  prefinal: 'bg-amber-500',
  final: 'bg-rose-500',
};

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function CompletionRing({ pct }: { pct: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <svg role="img" aria-label={`Average completion ${pct} percent`} width="84" height="84" viewBox="0 0 84 84">
      <circle cx="42" cy="42" r={r} fill="none" stroke="#f4f4f5" strokeWidth="10" />
      {pct > 0 && (
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke="#dc2626"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          transform="rotate(-90 42 42)"
        />
      )}
      <text x="42" y="48" textAnchor="middle" fontSize="18" fontWeight="800" fill="#18181b">
        {pct}%
      </text>
    </svg>
  );
}

export default async function TeacherProgressStrip({ classId, activities }: TeacherProgressStripProps) {
  const { enrolledStudents, overall, byTerm } = await getTeacherClassProgress(classId);

  if (overall.totalActivities === 0) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-[15px] font-bold text-gray-900">Submission overview</h2>
        <p className="mt-2 text-sm text-gray-500">
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

  const terms = byTerm.filter((t) => (MODULE_TERMS as readonly string[]).includes(t.term));

  return (
    <div className="space-y-4">
      <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-[15px] font-bold text-gray-900">Submission overview</h2>

        <div className="flex items-center gap-4">
          <CompletionRing pct={overall.avgCompletionPct} />
          <div>
            <p className="text-sm font-semibold text-gray-900">Average completion</p>
            <p className="text-xs text-gray-500">Across published activities</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { value: enrolledStudents, label: enrolledStudents === 1 ? 'Student' : 'Students' },
            { value: overall.totalActivities, label: 'Published' },
            { value: activities ? toGrade : '—', label: 'To grade' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-gray-50 px-2 py-2.5 text-center">
              <p className="text-xl font-extrabold text-gray-900">{s.value}</p>
              <p className="text-[11px] text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t border-gray-100 pt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">By term</p>
          {terms.map((t) => (
            <div key={t.term} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className={`font-semibold ${TERM_TEXT[t.term]}`}>{MODULE_TERM_LABELS[t.term]}</span>
                <span className={t.totalActivities === 0 ? 'text-xs text-gray-400' : 'text-xs text-gray-600'}>
                  {t.totalActivities === 0
                    ? 'No activities yet'
                    : `${t.totalSubmissions} / ${t.possibleSubmissions} · ${t.avgCompletionPct}%`}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${TERM_BAR[t.term]}`}
                  style={{ width: `${t.totalActivities === 0 ? 0 : t.avgCompletionPct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {activities && dueSoon.length > 0 && (
        <section className="space-y-2.5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-[15px] font-bold text-gray-900">Due soon</h2>
          <ul className="space-y-2">
            {dueSoon.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/teacher/classes/${classId}/activities/${a.id}`}
                  className="flex items-start justify-between gap-3 rounded-md text-sm hover:text-red-700"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-gray-800">{a.title}</span>
                    <span className="text-xs text-gray-500">
                      {a.missing === 0
                        ? 'Everyone submitted'
                        : `${a.missing} not submitted yet`}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-amber-700">
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