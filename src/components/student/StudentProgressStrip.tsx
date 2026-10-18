// src/components/student/StudentProgressStrip.tsx
// Right-side "Your progress" panel on the student Activities tab.
import Link from 'next/link';
import { getStudentClassProgress } from '@/lib/actions/progress';
import type { ActivityWithStudentState } from '@/lib/types/activities';

interface StudentProgressStripProps {
  classId: string;
  /** Optional: enables the To do / Missed / Graded stats and "Up next". */
  activities?: ActivityWithStudentState[];
}

const CARD = 'rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

function CompletionRing({ pct }: { pct: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <svg role="img" aria-label={`${pct} percent submitted`} width="84" height="84" viewBox="0 0 84 84" className="shrink-0">
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
      <text x="42" y="47" textAnchor="middle" fontSize="17" fontWeight="800" fill="#18181b">
        {pct}%
      </text>
    </svg>
  );
}

export default async function StudentProgressStrip({ classId, activities }: StudentProgressStripProps) {
  const { overall } = await getStudentClassProgress(classId);
  if (overall.total === 0) return null;

  const pct = Math.round((overall.done / overall.total) * 100);
  const left = overall.total - overall.done;

  const list = activities ?? [];
  const todo = list.filter((a) => ['not_started', 'open', 'late_window'].includes(a.status));
  const missed = list.filter((a) => a.status === 'missing').length;
  const graded = list.filter((a) => a.status === 'graded_unreturned' || a.status === 'graded_returned').length;
  const upNext = [...todo]
    .sort((x, y) => new Date(x.dueAt).getTime() - new Date(y.dueAt).getTime())
    .slice(0, 3);

  const rows = [
    { label: 'To do', value: todo.length, alert: false },
    { label: 'Missed', value: missed, alert: missed > 0 },
    { label: 'Graded', value: graded, alert: false },
  ];

  return (
    <div className="space-y-4">
      <section className={CARD}>
        <h2 className="text-[15px] font-bold text-zinc-900">Your progress</h2>

        <div className="mt-4 flex items-center gap-4">
          <CompletionRing pct={pct} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900">
              {overall.done} of {overall.total} submitted
            </p>
            <p className="text-xs text-zinc-500">{left === 0 ? 'All caught up. Nice work!' : `${left} left to do.`}</p>
          </div>
        </div>

        {activities && (
          <dl className="mt-4 divide-y divide-zinc-100 border-t border-zinc-100">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between py-2.5 text-sm">
                <dt className="text-zinc-600">{r.label}</dt>
                <dd className={r.alert ? 'font-bold text-red-600' : 'font-bold text-zinc-900'}>{r.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {activities && upNext.length > 0 && (
        <section className={CARD}>
          <h2 className="text-[15px] font-bold text-zinc-900">Up next</h2>
          <ul className="mt-3 space-y-1">
            {upNext.map((a) => {
              const d = new Date(a.dueAt);
              return (
                <li key={a.id}>
                  <Link
                    href={`/student/classes/${classId}/activities/${a.id}`}
                    className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-zinc-50"
                  >
                    <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-zinc-900 text-white">
                      <span className="text-[9px] font-semibold uppercase leading-none text-white/60">
                        {d.toLocaleDateString('en-PH', { month: 'short' })}
                      </span>
                      <span className="text-sm font-bold leading-tight">{d.getDate()}</span>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 group-hover:text-red-700">
                      {a.title}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}