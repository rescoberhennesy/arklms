'use client';

import { useState, useEffect, useMemo, useTransition, useCallback } from 'react';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CalendarDays,
} from 'lucide-react';
import {
  getMonthGrid,
  toLocalDateKey,
  formatMonthLabel,
  addMonths,
  isoMonthStart,
  isoMonthEnd,
  getWeekdayHeaders,
} from '@/lib/utils/calendar';
import type { CalendarActivity } from '@/lib/types/dashboard';

interface CalendarWidgetProps {
  /** Initial month's activities, fetched server-side by the parent page. */
  initialActivities: CalendarActivity[];
  /** Server action to refetch when the month changes. Same shape for student/teacher. */
  fetcher: (monthStart: string, monthEnd: string) => Promise<CalendarActivity[]>;
  /** Role drives draft styling (teacher) vs. simple dot (student). */
  role: 'student' | 'teacher';
  /** /student/classes/... or /teacher/classes/... base for activity links. */
  classesBasePath: '/student/classes' | '/teacher/classes';
}

export default function CalendarWidget({
  initialActivities,
  fetcher,
  role,
  classesBasePath,
}: CalendarWidgetProps) {
  // Anchor on today's month. Year/month0 (0-indexed JS month) drive everything.
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month0, setMonth0] = useState(today.getMonth());

  const [activities, setActivities] = useState<CalendarActivity[]>(initialActivities);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefreshing] = useTransition();

  // The initialActivities are for the CURRENT (today's) month — refetch
  // any time year/month0 changes off the anchor.
  const isAnchorMonth =
    year === today.getFullYear() && month0 === today.getMonth();

  useEffect(() => {
    if (isAnchorMonth) {
      // Adopt the freshly-passed initial set when we navigate back to "today".
      setActivities(initialActivities);
      return;
    }
    setError(null);
    startRefreshing(async () => {
      try {
        const next = await fetcher(
          isoMonthStart(year, month0),
          isoMonthEnd(year, month0),
        );
        setActivities(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load calendar.');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month0]);

  // When `initialActivities` changes (e.g. parent revalidates after a save)
  // AND we're on the anchor month, adopt the new list.
  useEffect(() => {
    if (isAnchorMonth) setActivities(initialActivities);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialActivities]);

  // Group activities by local date key for fast lookup on each grid cell.
  const byDateKey = useMemo(() => {
    const map = new Map<string, CalendarActivity[]>();
    for (const a of activities) {
      const key = toLocalDateKey(new Date(a.dueAt));
      const existing = map.get(key);
      if (existing) existing.push(a);
      else map.set(key, [a]);
    }
    // Sort each day's bucket by due-time ascending.
    for (const arr of map.values()) {
      arr.sort((x, y) => new Date(x.dueAt).getTime() - new Date(y.dueAt).getTime());
    }
    return map;
  }, [activities]);

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

  const selectedDayItems = selectedDateKey
    ? byDateKey.get(selectedDateKey) ?? []
    : [];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          <CalendarIcon className="h-4 w-4" />
          Calendar
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrev}
            disabled={refreshing}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[8rem] text-center text-sm font-medium text-gray-800">
            {formatMonthLabel(year, month0)}
          </span>
          <button
            type="button"
            onClick={handleNext}
            disabled={refreshing}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleToday}
            disabled={refreshing}
            className="ml-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Today
          </button>
          {refreshing && (
            <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-gray-400" />
          )}
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Weekday headers */}
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {weekdays.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((day) => {
          const items = byDateKey.get(day.dateKey) ?? [];
          const isSelected = selectedDateKey === day.dateKey;
          const hasItems = items.length > 0;
          return (
            <button
              key={day.dateKey}
              type="button"
              onClick={() => setSelectedDateKey(isSelected ? null : day.dateKey)}
              className={[
                'relative aspect-square min-h-[2.25rem] rounded-md text-xs transition',
                day.inCurrentMonth ? 'text-gray-700' : 'text-gray-300',
                day.isToday ? 'ring-1 ring-red-500' : '',
                isSelected
                  ? 'bg-red-50 ring-2 ring-red-500'
                  : hasItems
                    ? 'bg-gray-50 hover:bg-gray-100'
                    : 'hover:bg-gray-50',
              ].join(' ')}
              aria-label={`${day.dateKey}${hasItems ? `, ${items.length} activity${items.length === 1 ? '' : 's'}` : ''}`}
              aria-pressed={isSelected}
            >
              <span className="absolute left-1 top-1 font-medium">
                {day.date.getDate()}
              </span>
              {hasItems && (
                <span className="absolute inset-x-0 bottom-1 flex justify-center gap-0.5">
                  {/* Up to 3 dots — one per activity, capped. */}
                  {items.slice(0, 3).map((a, i) => (
                    <DayDot
                      key={i}
                      colorHex={a.classColor}
                      isDraft={role === 'teacher' && !a.published}
                    />
                  ))}
                  {items.length > 3 && (
                    <span className="text-[9px] font-bold text-gray-500">
                      +{items.length - 3}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day expansion */}
      {selectedDateKey && (
        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
            <CalendarDays className="h-3.5 w-3.5" />
            {new Date(selectedDateKey).toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          {selectedDayItems.length === 0 ? (
            <p className="text-xs italic text-gray-500">No activities due this day.</p>
          ) : (
            <ul className="space-y-1.5">
              {selectedDayItems.map((a) => {
                const due = new Date(a.dueAt);
                const timeLabel = due.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const isDraft = role === 'teacher' && !a.published;
                return (
                  <li key={a.activityId}>
                    <Link
                      href={`${classesBasePath}/${a.classId}/activities/${a.activityId}`}
                      className="flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-xs hover:bg-gray-100"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: a.classColor }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-gray-900">{a.title}</span>
                        <span className="ml-2 text-gray-500">{a.className}</span>
                      </span>
                      <span className="shrink-0 text-gray-500">
                        {a.activityKind === 'quiz' ? 'Quiz' : 'Assignment'} · {timeLabel}
                      </span>
                      {isDraft && (
                        <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-gray-600">
                          Draft
                        </span>
                      )}
                    </Link>
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

/** Single dot under a day. Filled = published, ring-only = draft. */
function DayDot({ colorHex, isDraft }: { colorHex: string; isDraft: boolean }) {
  if (isDraft) {
    return (
      <span
        className="h-1.5 w-1.5 rounded-full border"
        style={{ borderColor: colorHex, backgroundColor: 'transparent' }}
        aria-hidden
      />
    );
  }
  return (
    <span
      className="h-1.5 w-1.5 rounded-full"
      style={{ backgroundColor: colorHex }}
      aria-hidden
    />
  );
}