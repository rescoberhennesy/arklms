// src/components/dashboard/StatCardsRow.tsx
//
// 3-card stat row used by both dashboards. Each card: label + count.
// Teacher and student pass different cards (different labels), but the
// rendering is identical.

import type { LucideIcon } from 'lucide-react';

export interface StatCardItem {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: 'red' | 'amber' | 'indigo' | 'slate';
}

interface StatCardsRowProps {
  items: StatCardItem[];
}

const TONE_BG: Record<StatCardItem['tone'], string> = {
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
  indigo: 'bg-indigo-50 text-indigo-700',
  slate: 'bg-slate-100 text-slate-700',
};

export default function StatCardsRow({ items }: StatCardsRowProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONE_BG[item.tone]}`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {item.label}
              </p>
              <p className="mt-0.5 text-2xl font-bold text-slate-900">
                {item.value}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}