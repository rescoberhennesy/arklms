// src/components/teacher/AnalyticsSideCards.tsx
// Shared right-column cards for the Analytics tab: Summary + AI action.
import { Sparkles, Loader2 } from 'lucide-react';

export const ANALYTICS_CARD =
  'rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

export interface SummaryRow {
  label: string;
  value: string;
  sub?: string;
  tone?: 'red' | 'amber';
}

export function SummaryCard({ rows }: { rows: SummaryRow[] }) {
  return (
    <section className={`${ANALYTICS_CARD} px-5 py-4`}>
      <h3 className="mb-1 text-[15px] font-extrabold text-zinc-900">Summary</h3>
      {rows.map((r, i) => (
        <div
          key={r.label}
          className={`flex items-center justify-between gap-3 py-3 ${i > 0 ? 'border-t border-zinc-100' : ''}`}
        >
          <div className="min-w-0">
            <p className="text-sm text-zinc-700">{r.label}</p>
            {r.sub && <p className="text-xs text-zinc-400">{r.sub}</p>}
          </div>
          <p
            className={`text-[22px] font-extrabold ${
              r.tone === 'red' ? 'text-red-600' : r.tone === 'amber' ? 'text-amber-600' : 'text-zinc-900'
            }`}
          >
            {r.value}
          </p>
        </div>
      ))}
    </section>
  );
}

export function AiActionCard({
  title,
  text,
  buttonLabel,
  onClick,
  pending,
  disabled,
}: {
  title: string;
  text: string;
  buttonLabel: string;
  onClick: () => void;
  pending: boolean;
  disabled?: boolean;
}) {
  return (
    <section className={`${ANALYTICS_CARD} space-y-3 p-5`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <Sparkles className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-zinc-900">{title}</p>
          <p className="text-[13px] text-zinc-500">{text}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending || disabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {buttonLabel}
      </button>
    </section>
  );
}

/** Result card for AI output (neutral, not purple). */
export function AiResultCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${ANALYTICS_CARD} p-5`}>
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-red-700">
        <Sparkles className="h-4 w-4" />
        {title}
      </div>
      {children}
    </section>
  );
}