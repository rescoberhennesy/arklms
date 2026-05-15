'use client';

import { useState, useEffect, useMemo, useTransition, useCallback } from 'react';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CalendarDays,
  CheckSquare,
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
import type {
  CalendarActivity,
  CalendarPersonalTask,
} from '@/lib/types/dashboard';
import type { CalendarFetchResult } from '@/lib/actions/dashboard';

interface CalendarWidgetProps {
  /** Initial month's activities + personal tasks, fetched server-side. */
  initialData: CalendarFetchResult;
  /** Server action to refetch when the month changes. */
  fetcher: (monthStart: string, monthEnd: string) => Promise<CalendarFetchResult>;
  /** Role drives draft styling (teacher) vs. simple dot (student). */
  role: 'student' | 'teacher';
  /** /student/classes/... or /teacher/classes/... base for activity links. */
  classesBasePath: '/student/classes' | '/teacher/classes';
}

// Neutral slate gray for personal-task dots. Distinct from any class color.
const TASK_DOT_COLOR = '#94a3b8'; // slate-400

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

  const isAnchorMonth =
    year === today.getFullYear() && month0 === today.getMonth();

  useEffect(() => {
    if (isAnchorMonth) {
      setData(initialData);
      return;
    }
    setError(null);
    startRefreshing(async () => {
      try {
        const next = await fetcher(
          isoMonthStart(year, month0),
          isoMonthEnd(year, month0),
        );
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

  // Group both activities and tasks by local date key for fast lookup.
  const byDateKey = useMemo(() => {
    const map = new Map<
      string,
      { activities: CalendarActivity[]; tasks: CalendarPersonalTask[] }
    >();
    const ensure = (key: string) => {
      let bucket = map.get(key);
      if (!bucket) {
        bucket = { activities: [], tasks: [] };
        map.set(key, bucket);
      }
      return bucket;
    };
    for (const a of data.activities) {
      ensure(toLocalDateKey(new Date(a.dueAt))).activities.push(a);
    }
    for (const t of data.personalTasks) {
      ensure(toLocalDateKey(new Date(t.dueAt))).tasks.push(t);
    }
    for (const b of map.values()) {
      b.activities.sort(
        (x, y) => new Date(x.dueAt).getTime() - new Date(y.dueAt).getTime(),
      );
      b.tasks.sort(
        (x, y) => new Date(x.dueAt).getTime() - new Date(y.dueAt).getTime(),
      );
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

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
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
          <span className="min-w-[7rem] text-center text-sm font-medium text-gray-800">
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

      {/* Day-of-week headers — same 7-col grid as the cell grid */}
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {weekdays.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((day) => {
          const bucket = byDateKey.get(day.dateKey);
          const items = bucket?.activities ?? [];
          const tasks = bucket?.tasks ?? [];
          const isSelected = selectedDateKey === day.dateKey;
          const hasAnything = items.length > 0 || tasks.length > 0;
          const totalDots = Math.min(items.length, 3) + Math.min(tasks.length, 2);
          return (
            <button
              key={day.dateKey}
              type="button"
              onClick={() => setSelectedDateKey(isSelected ? null : day.dateKey)}
              className={[
                // Flex column: number on top (centered), dots row at bottom.
                'flex aspect-square min-h-[2.25rem] flex-col items-center justify-center gap-0.5 rounded-md text-xs transition',
                day.inCurrentMonth ? 'text-gray-700' : 'text-gray-300',
                day.isToday ? 'ring-1 ring-red-500' : '',
                isSelected
                  ? 'bg-red-50 ring-2 ring-red-500'
                  : hasAnything
                    ? 'bg-gray-50 hover:bg-gray-100'
                    : 'hover:bg-gray-50',
              ].join(' ')}
              aria-label={`${day.dateKey}${hasAnything ? `, ${items.length + tasks.length} item(s)` : ''}`}
              aria-pressed={isSelected}
            >
              <span className="font-medium leading-none">
                {day.date.getDate()}
              </span>
              {hasAnything && (
                <span className="flex h-1.5 items-center justify-center gap-0.5">
                  {items.slice(0, 3).map((a, i) => (
                    <DayDot
                      key={`a${i}`}
                      colorHex={a.classColor}
                      isDraft={role === 'teacher' && !a.published}
                    />
                  ))}
                  {tasks.slice(0, 2).map((_, i) => (
                    <DayDot key={`t${i}`} colorHex={TASK_DOT_COLOR} isDraft={false} />
                  ))}
                  {items.length + tasks.length > totalDots && (
                    <span className="text-[9px] font-bold leading-none text-gray-500">
                      +{items.length + tasks.length - totalDots}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

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
          {selectedBucket.activities.length === 0 &&
          selectedBucket.tasks.length === 0 ? (
            <p className="text-xs italic text-gray-500">Nothing this day.</p>
          ) : (
            <ul className="space-y-1.5">
              {selectedBucket.activities.map((a) => {
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
              {selectedBucket.tasks.map((t) => {
                const due = new Date(t.dueAt);
                const timeLabel = due.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return (
                  <li
                    key={t.taskId}
                    className="flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-xs"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: TASK_DOT_COLOR }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-gray-900">{t.title}</span>
                    </span>
                    <span className="shrink-0 text-gray-500">
                      Personal task · {timeLabel}
                    </span>
                    <CheckSquare className="h-3 w-3 shrink-0 text-slate-400" />
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