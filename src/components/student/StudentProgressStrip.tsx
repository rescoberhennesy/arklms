// src/components/student/StudentProgressStrip.tsx
// Right-side "Your progress" panel on the student Activities tab.
import Link from 'next/link';
import { getStudentClassProgress } from '@/lib/actions/progress';
import { MODULE_TERMS, MODULE_TERM_LABELS, type ModuleTerm } from '@/lib/types/modules';
import type { ActivityWithStudentState } from '@/lib/types/activities';

interface StudentProgressStripProps {
  classId: string;
  /** Optional: enables the To do / Missed / Graded stats and "Up next". */
  activities?: ActivityWithStudentState[];
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

function CompletionRing({ pct }: { pct: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <svg role="img" aria-label={`${pct} percent submitted`} width="84" height="84" viewBox="0 0 84 84">
      <circle cx="42" cy="42" r={r} fill="none" stroke="#f4f4f5" strokeWidth="10" />
      {pct > 0 && (
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke="#16a34a"
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

export default async function StudentProgressStrip({ classId, activities }: StudentProgressStripProps) {
  const { overall, byTerm } = await getStudentClassProgress(classId);
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

  const terms = byTerm.filter((t) => (MODULE_TERMS as readonly string[]).includes(t.term));

  return (
    <div className="space-y-4">
      <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-[15px] font-bold text-gray-900">Your progress</h2>

        <div className="flex items-center gap-4">
          <CompletionRing pct={pct} />
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {overall.done} of {overall.total} submitted
            </p>
            <p className="text-xs text-gray-500">
              {left === 0 ? 'All caught up. Nice work!' : `${left} left to do.`}
            </p>
          </div>
        </div>

        {activities && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: todo.length, label: 'To do' },
              { value: missed, label: 'Missed' },
              { value: graded, label: 'Graded' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-gray-50 px-2 py-2.5 text-center">
                <p className={`text-xl font-extrabold ${s.label === 'Missed' && s.value > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {s.value}
                </p>
                <p className="text-[11px] text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 border-t border-gray-100 pt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">By term</p>
          {terms.map((t) => (
            <div key={t.term} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className={`font-semibold ${TERM_TEXT[t.term]}`}>{MODULE_TERM_LABELS[t.term]}</span>
                <span className={t.total === 0 ? 'text-xs text-gray-400' : 'text-xs text-gray-600'}>
                  {t.total === 0 ? 'No activities yet' : `${t.done} / ${t.total}`}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${TERM_BAR[t.term]}`}
                  style={{ width: `${t.total === 0 ? 0 : Math.round((t.done / t.total) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {activities && upNext.length > 0 && (
        <section className="space-y-2.5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-[15px] font-bold text-gray-900">Up next</h2>
          <ul className="space-y-2">
            {upNext.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/student/classes/${classId}/activities/${a.id}`}
                  className="flex items-start justify-between gap-3 text-sm hover:text-red-700"
                >
                  <span className="min-w-0 truncate text-gray-800">{a.title}</span>
                  <span className="shrink-0 text-xs font-semibold text-amber-700">
                    {new Date(a.dueAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
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