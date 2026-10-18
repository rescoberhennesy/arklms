// src/components/dashboard/ClassDeadlinesWidget.tsx
//
// Left-column widget on the teacher dashboard: published activities due in
// the next 7 days (upcoming only). Data: TeacherTodoItem rows with kind
// 'class_deadline'.

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { TeacherTodoItem } from '@/lib/types/dashboard';

interface ClassDeadlinesWidgetProps {
  /** Pass ALL TeacherTodoItems; widget filters to upcoming class_deadlines. */
  items: TeacherTodoItem[];
}

function formatRelativeFuture(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 60_000) return 'soon';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(ms / 3_600_000);
  if (hrs < 24) return `in ${hrs}h`;
  const days = Math.round(ms / 86_400_000);
  return `in ${days}d`;
}

export default function ClassDeadlinesWidget({ items }: ClassDeadlinesWidgetProps) {
  const upcoming = useMemo(() => {
    const now = Date.now();
    return items
      .filter((i) => i.kind === 'class_deadline')
      .filter((i) => new Date(i.sortKey).getTime() > now)
      .sort((a, b) => new Date(a.sortKey).getTime() - new Date(b.sortKey).getTime());
  }, [items]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-[17px] font-extrabold text-zinc-900">Class deadlines</h2>
        {upcoming.length > 0 && <span className="text-xs text-zinc-400">{upcoming.length} upcoming</span>}
      </header>

      {upcoming.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-7 text-center">
          <p className="text-sm font-semibold text-zinc-700">No upcoming deadlines.</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Published activities due in the next 7 days will show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((item) => {
            const due = new Date(item.sortKey);
            return (
              <li key={`d:${item.activityId}`}>
                <Link
                  href={`/teacher/classes/${item.classId}/activities/${item.activityId}`}
                  className="flex items-center gap-3.5 rounded-xl bg-zinc-50 p-3 transition hover:bg-zinc-100"
                >
                  <span className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-zinc-900 py-1.5 text-white">
                    <span className="text-[10px] font-bold uppercase text-red-400">
                      {due.toLocaleDateString(undefined, { month: 'short' })}
                    </span>
                    <span className="text-[17px] font-extrabold leading-tight">{due.getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-zinc-900">{item.activityTitle}</span>
                    <span className="block truncate text-xs text-zinc-500">
                      {item.className} ·{' '}
                      <span className="font-semibold text-red-700">Due {formatRelativeFuture(item.sortKey)}</span>
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}