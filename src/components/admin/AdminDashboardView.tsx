'use client';

import { Users, GraduationCap, BookOpen, Clock } from 'lucide-react';
import type {
  AdminDashboardStats,
  AdminActivityItem,
  AdminChartData,
} from '@/lib/actions/admin';
import Link from 'next/link';
import AdminDashboardCharts from './AdminDashboardCharts';

interface Props {
  stats: AdminDashboardStats;
  activity: AdminActivityItem[];
  charts: AdminChartData;
}

export default function AdminDashboardView({ stats, activity, charts }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin overview</h1>
        <p className="mt-1 text-sm text-gray-600">
          Institution-wide totals across all users and classes.
        </p>
      </div>

     {/* Stat strip */}
     <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Teachers"
          value={stats.teacherCount}
          icon={<Users className="h-4 w-4" />}
          href="/admin/teachers"
        />
        <StatCard
          label="Students"
          value={stats.studentCount}
          icon={<GraduationCap className="h-4 w-4" />}
          href="/admin/students"
        />
        <StatCard
          label="Active classes"
          value={stats.activeSectionCount}
          icon={<BookOpen className="h-4 w-4" />}
          href="/admin/sections"
        />
      </div>
      {/* Breakdown row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownCard
          title="Students by track"
          rows={stats.studentsByTrack.map((r) => ({
            label: r.track,
            count: r.count,
          }))}
          emptyHint="No students enrolled in any track yet."
          accent="amber"
        />
        <BreakdownCard
          title="Students by grade level"
          rows={stats.studentsByGradeLevel.map((r) => ({
            label: r.gradeLevel,
            count: r.count,
          }))}
          emptyHint="No students enrolled in any grade yet."
          accent="blue"
        />
      </div>

       {/* Charts */}
      <AdminDashboardCharts data={charts} />

      {/* Activity feed */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
          <Clock className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">
            Recent activity
          </h2>
        </div>
        {activity.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm italic text-gray-500">
            No recent activity yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {activity.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  href,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  href?: string;
}) {
  const baseClasses = 'rounded-xl border border-gray-200 bg-white p-4 shadow-sm';
  const interactiveClasses =
    'transition hover:border-gray-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2';

  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          {label}
        </span>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-50 text-red-600">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">
        {value}
      </p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={`${label}: ${value}`}
        className={`${baseClasses} ${interactiveClasses} block`}
      >
        {inner}
      </Link>
    );
  }
  return <div className={baseClasses}>{inner}</div>;
}

function BreakdownCard({
  title,
  rows,
  emptyHint,
  accent,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
  emptyHint: string;
  accent: 'amber' | 'blue';
}) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const barColor =
    accent === 'amber'
      ? 'bg-amber-400'
      : 'bg-blue-500';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm italic text-gray-500">{emptyHint}</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((r) => {
            const pct = total === 0 ? 0 : Math.round((r.count / total) * 100);
            return (
              <li key={r.label}>
                <div className="flex items-center justify-between text-xs font-medium text-gray-700">
                  <span>{r.label}</span>
                  <span className="tabular-nums text-gray-500">
                    {r.count} <span className="text-gray-400">({pct}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ActivityRow({ item }: { item: AdminActivityItem }) {
  const tint =
    item.kind === 'class_archived'
      ? 'bg-gray-100 text-gray-600'
      : item.kind === 'class_created'
        ? 'bg-emerald-50 text-emerald-700'
        : item.kind === 'enrollment_created'
          ? 'bg-blue-50 text-blue-700'
          : 'bg-red-50 text-red-700';

  const tag =
    item.kind === 'class_archived'
      ? 'Archived'
      : item.kind === 'class_created'
        ? 'New class'
        : item.kind === 'enrollment_created'
          ? 'Enrollment'
          : 'New account';

  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <span
        className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tint}`}
      >
        {tag}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {item.primary}
        </p>
        {item.secondary && (
          <p className="text-xs text-gray-500">{item.secondary}</p>
        )}
      </div>
      <span className="shrink-0 text-xs text-gray-400">
        {formatRelative(item.at)}
      </span>
    </li>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}