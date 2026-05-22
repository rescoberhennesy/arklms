// src/components/dashboard/StatCardsRow.tsx
//
// 3-card stat row used by teacher and student dashboards. Each card may
// be a plain div (no interaction), a Link (href), or a button (onClick).
// Click affordance is added automatically when either is provided.

'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export interface StatCardItem {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: 'red' | 'amber' | 'indigo' | 'slate';
  href?: string;
  onClick?: () => void;
  ariaLabel?: string;
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

// Shared visual styling. The interactive variants add hover + focus rings.
const BASE_CLASSES =
  'flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm';
const INTERACTIVE_CLASSES =
  'transition hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2';

export default function StatCardsRow({ items }: StatCardsRowProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {items.map((item) => {
        const Icon = item.icon;
        const inner = (
          <>
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
          </>
        );

        if (item.href) {
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-label={item.ariaLabel ?? `${item.label}: ${item.value}`}
              className={`${BASE_CLASSES} ${INTERACTIVE_CLASSES}`}
            >
              {inner}
            </Link>
          );
        }
        if (item.onClick) {
          return (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              aria-label={item.ariaLabel ?? `${item.label}: ${item.value}`}
              className={`${BASE_CLASSES} ${INTERACTIVE_CLASSES}`}
            >
              {inner}
            </button>
          );
        }
        return (
          <div key={item.label} className={BASE_CLASSES}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}