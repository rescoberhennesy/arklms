// src/components/dashboard/StatCardsRow.tsx
//
// 3-card stat row. Each card may be a plain div, a Link (href), or a
// button (onClick). Same look as the teacher dashboard stat cards.

'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export interface StatCardItem {
  label: string;
  value: number;
  icon: LucideIcon;
  /** 'dark' = black card for the stat that needs action. Others render as white cards. */
  tone: 'red' | 'amber' | 'indigo' | 'slate' | 'dark';
  href?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

interface StatCardsRowProps {
  items: StatCardItem[];
}

export default function StatCardsRow({ items }: StatCardsRowProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {items.map((item) => {
        const Icon = item.icon;
        const dark = item.tone === 'dark';
        const interactive = Boolean(item.href || item.onClick);

        const className = `flex w-full items-center gap-4 rounded-2xl p-5 text-left ${
          dark
            ? `bg-zinc-900 text-white ${interactive ? 'transition hover:bg-zinc-800' : ''}`
            : `border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${
                interactive ? 'transition hover:border-zinc-300 hover:shadow-md' : ''
              }`
        }`;

        const inner = (
          <>
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                dark ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600'
              }`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className={`block text-[13px] ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>{item.label}</span>
              <span className="block text-[28px] font-extrabold leading-tight">{item.value}</span>
            </span>
          </>
        );

        const aria = item.ariaLabel ?? `${item.label}: ${item.value}`;

        if (item.href) {
          return (
            <Link key={item.label} href={item.href} aria-label={aria} className={className}>
              {inner}
            </Link>
          );
        }
        if (item.onClick) {
          return (
            <button key={item.label} type="button" onClick={item.onClick} aria-label={aria} className={className}>
              {inner}
            </button>
          );
        }
        return (
          <div key={item.label} className={className}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}