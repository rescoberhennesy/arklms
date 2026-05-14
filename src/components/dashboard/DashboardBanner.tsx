// src/components/dashboard/DashboardBanner.tsx
//
// Hero banner at the top of both dashboards.
//
// Teacher variant: greeting + "Create Class" CTA.
// Student variant: greeting only (no CTA).
//
// Today's date sits in the top-right. Server renders the greeting from
// the current hour (good morning / afternoon / evening) — passed in as
// a prop so the page is the source of truth.

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
    <section className="relative overflow-hidden rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 via-rose-50 to-white p-6 shadow-sm sm:p-8">
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-2xl font-bold text-red-700">
            {greeting}, {userName}
          </p>
          <h1 className="mt-1 text-[10px] font-bold tracking-tight text-gray-900 sm:text-[20px]">
            {subtitle}
          </h1>
          {showCreateClass && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Link
                href="/teacher/classes?create=1"
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
              >
                <Plus className="h-4 w-4" />
                Create class
              </Link>
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-4xl font-bold tracking-tight text-red-700">
            {todayDayOfMonth}
          </p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-gray-500">
            {todayLabel}
          </p>
        </div>
      </div>

      {/* Decorative blobs — subtle, behind the content */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-red-200/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-rose-200/40 blur-3xl"
      />
    </section>
  );
}