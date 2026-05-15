// src/components/dashboard/ClassDeadlinesWidget.tsx
//
// Left-column widget on teacher dashboard.
// Shows class deadlines (published activities due in next 7 days, upcoming only).
//
// Data source: TeacherTodoItem rows where kind === 'class_deadline'.
// We filter out any that are already past-due — those aren't actionable as
// "upcoming deadlines" anymore (their ungraded submissions will surface in
// the right-column To-do widget anyway).

'use client';

import { useMemo } from 'react';
import { Calendar as CalendarIcon, Clock } from 'lucide-react';
import type { TeacherTodoItem } from '@/lib/types/dashboard';
import TodoRow from './TodoRow';

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

export default function ClassDeadlinesWidget({
  items,
}: ClassDeadlinesWidgetProps) {
  const upcoming = useMemo(() => {
    const now = Date.now();
    return items
      .filter((i) => i.kind === 'class_deadline')
      .filter((i) => new Date(i.sortKey).getTime() > now)
      .sort(
        (a, b) =>
          new Date(a.sortKey).getTime() - new Date(b.sortKey).getTime(),
      );
  }, [items]);

  // Hide widget entirely when there's nothing upcoming — keeps the
  // left column tidy.
  if (upcoming.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <CalendarIcon className="h-4 w-4 text-amber-500" />
            Class deadlines
          </h2>
        </header>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
          <Clock className="mb-1 h-5 w-5 text-slate-400" />
          <p className="text-sm font-medium text-slate-700">
            No upcoming deadlines.
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Published activities due in the next 7 days will show up here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CalendarIcon className="h-4 w-4 text-amber-500" />
          Class deadlines
        </h2>
        <span className="text-xs text-slate-500">
          {upcoming.length} upcoming
        </span>
      </header>

      <ul className="flex flex-col gap-1.5">
        {upcoming.map((item) => (
          <li key={`d:${item.activityId}`}>
            <TodoRow
              href={`/teacher/classes/${item.classId}/activities/${item.activityId}`}
              title={item.activityTitle}
              meta={
                <>
                  <span className="truncate">{item.className}</span>
                  <span aria-hidden>·</span>
                  <span className="text-amber-700">
                    Due {formatRelativeFuture(item.sortKey)}
                  </span>
                </>
              }
              rightSlot={
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  <CalendarIcon className="h-3 w-3" />
                  Deadline
                </span>
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}