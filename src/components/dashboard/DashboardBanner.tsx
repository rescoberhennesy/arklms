// src/components/dashboard/DashboardBanner.tsx
//
// Hero banner at the top of both dashboards.
// Teacher variant: greeting + "Create class" CTA. Student variant: greeting only.

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
    <section className="relative overflow-hidden rounded-3xl bg-red-700 px-6 py-7 text-white shadow-[0_16px_36px_-14px_rgba(185,28,28,0.55)] sm:px-9 sm:py-8">
      {/* Decorative circles */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 900 220"
        preserveAspectRatio="xMaxYMid slice"
      >
        <circle cx="820" cy="0" r="160" fill="#ffffff" fillOpacity="0.07" />
        <circle cx="680" cy="240" r="100" fill="#000000" fillOpacity="0.1" />
        <circle cx="890" cy="210" r="56" fill="#ffffff" fillOpacity="0.06" />
      </svg>

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[32px]">
            {greeting}, {userName}
          </h1>
          <p className="mt-1.5 text-base text-red-100">{subtitle}</p>
          {showCreateClass && (
            <Link
              href="/teacher/classes?create=1"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-red-700 shadow-sm transition hover:bg-red-50 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Create class
            </Link>
          )}
        </div>

        <div className="flex h-[104px] w-[104px] shrink-0 flex-col items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-center">
          <span className="text-[40px] font-extrabold leading-none">{todayDayOfMonth}</span>
          <span className="mt-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-red-100">
            {todayLabel}
          </span>
        </div>
      </div>
    </section>
  );
}