// src/components/dashboard/DashboardBanner.tsx
//
// Hero banner at the top of both dashboards.
// Teacher variant: greeting + "Create class" CTA. Student variant: greeting only.
// Style: charcoal surface; red reserved for the CTA and the date dot.

import Link from 'next/link';
import { Plus } from 'lucide-react';

interface DashboardBannerProps {
  greeting: string; // e.g. "Good morning"
  userName: string;
  subtitle: string;
  todayLabel: string; // e.g. "Tue, May 12"
  todayDayOfMonth: number;
  showCreateClass: boolean; // teacher: true, student: false
}

export default function DashboardBanner({
  greeting,
  userName,
  subtitle,
  todayLabel,
  todayDayOfMonth,
  showCreateClass,
}: DashboardBannerProps) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-zinc-900 px-6 py-7 text-white shadow-[0_16px_36px_-18px_rgba(0,0,0,0.45)] sm:px-9 sm:py-8">
      {/* Decorative outline circles */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 900 220"
        preserveAspectRatio="xMaxYMid slice"
      >
        <circle cx="830" cy="-10" r="170" fill="none" stroke="#ffffff" strokeOpacity="0.07" />
        <circle cx="760" cy="40" r="105" fill="none" stroke="#ffffff" strokeOpacity="0.06" />
        <circle cx="880" cy="215" r="60" fill="none" stroke="#ffffff" strokeOpacity="0.05" />
      </svg>

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-400">
            <span className="h-2 w-2 rounded-full bg-red-600" />
            {todayLabel}
          </p>
          <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight sm:text-[32px]">
            {greeting}, {userName}
          </h1>
          <p className="mt-1.5 text-base text-zinc-300">{subtitle}</p>
          {showCreateClass && (
            <Link
              href="/teacher/classes?create=1"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Create class
            </Link>
          )}
        </div>

        <div className="flex h-[104px] w-[104px] shrink-0 flex-col items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-950 text-center">
          <span className="text-[40px] font-extrabold leading-none">{todayDayOfMonth}</span>
          <span className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-red-400">
            Today
          </span>
        </div>
      </div>
    </section>
  );
}