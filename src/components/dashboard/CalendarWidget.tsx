'use client';

import { useState, useEffect, useMemo, useTransition, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import {
  getMonthGrid,
  toLocalDateKey,
  formatMonthLabel,
  addMonths,
  isoMonthStart,
  isoMonthEnd,
  getWeekdayHeaders,
} from '@/lib/utils/calendar';
import type { CalendarActivity, CalendarPersonalTask } from '@/lib/types/dashboard';
import type { CalendarFetchResult } from '@/lib/actions/dashboard';

interface CalendarWidgetProps {
  /** Initial month's activities + personal tasks, fetched server-side. */
  initialData: CalendarFetchResult;
  /** Server action to refetch when the month changes. */
  fetcher: (monthStart: string, monthEnd: string) => Promise<CalendarFetchResult>;
  /** Role drives draft styling (teacher). */
  role: 'student' | 'teacher';
  /** /student/classes/... or /teacher/classes/... base for activity links. */
  classesBasePath: '/student/classes' | '/teacher/classes';
}

export default function CalendarWidget({
  initialData,
  fetcher,
  role,
  classesBasePath,
}: CalendarWidgetProps) {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month0, setMonth0] = useState(today.getMonth());

  const [data, setData] = useState<CalendarFetchResult>(initialData);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefreshing] = useTransition();

  const isAnchorMonth = year === today.getFullYear() && month0 === today.getMonth();

  useEffect(() => {
    if (isAnchorMonth) {
      setData(initialData);
      return;
    }
    setError(null);
    startRefreshing(async () => {
      try {
        const next = await fetcher(isoMonthStart(year, month0), isoMonthEnd(year, month0));
        setData(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load calendar.');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month0]);

  useEffect(() => {
    if (isAnchorMonth) setData(initialData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);

  const byDateKey = useMemo(() => {
    const map = new Map<string, { activities: CalendarActivity[]; tasks: CalendarPersonalTask[] }>();
    const ensure = (key: string) => {
      let bucket = map.get(key);
      if (!bucket) {
        bucket = { activities: [], tasks: [] };
        map.set(key, bucket);
      }
      return bucket;
    };
    for (const a of data.activities) ensure(toLocalDateKey(new Date(a.dueAt))).activities.push(a);
    for (const t of data.personalTasks) ensure(toLocalDateKey(new Date(t.dueAt))).tasks.push(t);
    for (const b of map.values()) {
      b.activities.sort((x, y) => new Date(x.dueAt).getTime() - new Date(y.dueAt).getTime());
      b.tasks.sort((x, y) => new Date(x.dueAt).getTime() - new Date(y.dueAt).getTime());
    }
    return map;
  }, [data]);

  const grid = useMemo(() => getMonthGrid(year, month0), [year, month0]);
  const weekdays = useMemo(() => getWeekdayHeaders(0), []);

  const handlePrev = useCallback(() => {
    const { year: y, month0: m } = addMonths(year, month0, -1);
    setYear(y);
    setMonth0(m);
    setSelectedDateKey(null);
  }, [year, month0]);

  const handleNext = useCallback(() => {
    const { year: y, month0: m } = addMonths(year, month0, 1);
    setYear(y);
    setMonth0(m);
    setSelectedDateKey(null);
  }, [year, month0]);

  const handleToday = useCallback(() => {
    setYear(today.getFullYear());
    setMonth0(today.getMonth());
    setSelectedDateKey(toLocalDateKey(today));
  }, [today]);

  const selectedBucket = selectedDateKey
    ? byDateKey.get(selectedDateKey) ?? { activities: [], tasks: [] }
    : { activities: [], tasks: [] };

  const navBtn =
    'flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50';

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-extrabold text-zinc-900">{formatMonthLabel(year, month0)}</h2>
        <div className="flex items-center gap-1.5">
          {refreshing && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
          <button type="button" onClick={handlePrev} disabled={refreshing} className={navBtn} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleToday}
            disabled={refreshing}
            className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            Today
          </button>
          <button type="button" onClick={handleNext} disabled={refreshing} className={navBtn} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-zinc-400">
        {weekdays.map((w) => (
          <div key={w}>{w.charAt(0)}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((day) => {
          const bucket = byDateKey.get(day.dateKey);
          const acts = bucket?.activities ?? [];
          const tasks = bucket?.tasks ?? [];
          const isSelected = selectedDateKey === day.dateKey;
          const hasAnything = acts.length > 0 || tasks.length > 0;
          const isToday = day.isToday;

          const tone = isToday
            ? 'bg-red-600 text-white font-extrabold'
            : hasAnything && day.inCurrentMonth
              ? 'bg-zinc-900 text-white font-bold'
              : day.inCurrentMonth
                ? 'text-zinc-700 hover:bg-zinc-100'
                : 'text-zinc-300 hover:bg-zinc-50';

          return (
            <button
              key={day.dateKey}
              type="button"
              onClick={() => setSelectedDateKey(isSelected ? null : day.dateKey)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-[13px] transition ${tone} ${
                isSelected ? 'ring-2 ring-red-400 ring-offset-1' : ''
              }`}
              aria-label={`${day.dateKey}${hasAnything ? `, ${acts.length + tasks.length} item(s)` : ''}`}
              aria-pressed={isSelected}
            >
              <span className="leading-none">{day.date.getDate()}</span>
              {hasAnything && (
                <span className="absolute bottom-1 flex gap-0.5">
                  {acts.length > 0 && (
                    <span
                      className={`h-1 w-1 rounded-full ${
                        role === 'teacher' && acts.every((a) => !a.published) ? 'bg-zinc-400' : 'bg-red-400'
                      }`}
                    />
                  )}
                  {tasks.length > 0 && <span className="h-1 w-1 rounded-full bg-zinc-300" />}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-4 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          Class deadline
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
          Personal task
        </span>
      </div>

      {selectedDateKey && (
        <div className="mt-4 border-t border-zinc-100 pt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-zinc-400">
            {new Date(selectedDateKey).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          {selectedBucket.activities.length === 0 && selectedBucket.tasks.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing this day.</p>
          ) : (
            <ul className="space-y-1.5">
              {selectedBucket.activities.map((a) => {
                const timeLabel = new Date(a.dueAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                const isDraft = role === 'teacher' && !a.published;
                return (
                  <li key={a.activityId}>
                    <Link
                      href={`${classesBasePath}/${a.classId}/activities/${a.activityId}`}
                      className="flex items-center gap-2.5 rounded-xl border border-zinc-100 px-3 py-2 transition hover:bg-zinc-50"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${isDraft ? 'border border-zinc-400' : 'bg-red-600'}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-zinc-900">{a.title}</span>
                        <span className="block truncate text-[11.5px] text-zinc-500">
                          {a.className} · {a.activityKind === 'quiz' ? 'Quiz' : 'Activity'} · {timeLabel}
                        </span>
                      </span>
                      {isDraft && (
                        <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
                          Draft
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
              {selectedBucket.tasks.map((t) => {
                const timeLabel = new Date(t.dueAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                return (
                  <li key={t.taskId} className="flex items-center gap-2.5 rounded-xl border border-zinc-100 px-3 py-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-zinc-900">{t.title}</span>
                      <span className="block text-[11.5px] text-zinc-500">Personal task · {timeLabel}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}