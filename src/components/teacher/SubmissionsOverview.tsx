'use client';

import { CheckCheck, Loader2 } from 'lucide-react';

export type RosterStudent = {
  student_id: string;
  full_name: string | null;
  email: string | null;
};

export function initialsOf(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export default function SubmissionsOverview({
  total,
  submitted,
  toGrade,
  graded,
  missing,
  dueAt,
  unreleased = 0,
  onRelease,
  releasing = false,
}: {
  total: number;
  submitted: number;
  toGrade: number;
  graded: number;
  missing: number;
  dueAt: string;
  unreleased?: number;
  onRelease?: () => void;
  releasing?: boolean;
}) {
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;
  const r = 29;
  const c = 2 * Math.PI * r;
  const pastDue = Date.now() > new Date(dueAt).getTime();
  const msLeft = new Date(dueAt).getTime() - Date.now();
  const days = Math.ceil(msLeft / 86_400_000);
  const dueText = `Due ${new Date(dueAt).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}${pastDue ? ' · past due' : ` · ${days} day${days === 1 ? '' : 's'} left`}`;

  const stats = [
    { label: 'Submitted', value: `${submitted}/${total}`, cls: 'text-zinc-900' },
    { label: 'To grade', value: toGrade, cls: toGrade > 0 ? 'text-red-600' : 'text-zinc-900' },
    { label: 'Graded', value: graded, cls: 'text-zinc-900' },
    {
      label: pastDue ? 'Missing' : 'Not yet',
      value: missing,
      cls: pastDue && missing > 0 ? 'text-amber-600' : 'text-zinc-900',
    },
  ];

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-center gap-5">
        <svg width="76" height="76" viewBox="0 0 72 72" role="img" aria-label={`${pct} percent submitted`} className="shrink-0">
          <circle cx="36" cy="36" r={r} fill="none" stroke="#f4f4f5" strokeWidth="8" />
          {pct > 0 && (
            <circle
              cx="36"
              cy="36"
              r={r}
              fill="none"
              stroke="#dc2626"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * c} ${c}`}
              transform="rotate(-90 36 36)"
            />
          )}
          <text x="36" y="41" textAnchor="middle" fontSize="15" fontWeight="800" fill="#18181b">
            {pct}%
          </text>
        </svg>
        <div className="grid min-w-[220px] flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-zinc-50 px-3 py-2.5">
              <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
              <p className="text-xs text-zinc-500">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3">
        <p className="text-xs text-zinc-500">
          {dueText}
          {unreleased > 0 && ` · ${unreleased} graded, not yet released`}
        </p>
        {unreleased > 0 && onRelease && (
          <button
            type="button"
            onClick={onRelease}
            disabled={releasing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {releasing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            Release {unreleased} grade{unreleased === 1 ? '' : 's'}
          </button>
        )}
      </div>
    </section>
  );
}