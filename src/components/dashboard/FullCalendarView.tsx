'use client';

import {
  useState,
  useEffect,
  useMemo,
  useTransition,
  useCallback,
} from 'react';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Loader2,
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

interface FullCalendarViewProps {
  initialData: CalendarFetchResult;
  fetcher: (monthStart: string, monthEnd: string) => Promise<CalendarFetchResult>;
  role: 'student' | 'teacher';
  classesBasePath: '/student/classes' | '/teacher/classes';
}

const TASK_DOT_COLOR = '#94a3b8';

// Item shape unified for sidebar rendering.
type CombinedItem =
  | { kind: 'activity'; activity: CalendarActivity; dueAt: string }
  | { kind: 'task'; task: CalendarPersonalTask; dueAt: string };

export default function FullCalendarView({
  initialData,
  fetcher,
  role,
  classesBasePath,
}: FullCalendarViewProps) {
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

  const byDateKey = useMemo(() => {
    const map = new Map<string, CombinedItem[]>();
    const ensure = (key: string) => {
      let arr = map.get(key);
      if (!arr) {
        arr = [];
        map.set(key, arr);
      }
      return arr;
    };
    for (const a of data.activities) {
      ensure(toLocalDateKey(new Date(a.dueAt))).push({
        kind: 'activity',
        activity: a,
        dueAt: a.dueAt,
      });
    }
    for (const t of data.personalTasks) {
      ensure(toLocalDateKey(new Date(t.dueAt))).push({
        kind: 'task',
        task: t,
        dueAt: t.dueAt,
      });
    }
    for (const arr of map.values()) {
      arr.sort(
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

  const sidebarSections = useMemo(() => {
    const all: CombinedItem[] = [
      ...data.activities.map(
        (a): CombinedItem => ({ kind: 'activity', activity: a, dueAt: a.dueAt }),
      ),
      ...data.personalTasks.map(
        (t): CombinedItem => ({ kind: 'task', task: t, dueAt: t.dueAt }),
      ),
    ].sort((x, y) => new Date(x.dueAt).getTime() - new Date(y.dueAt).getTime());

    if (selectedDateKey) {
      const filtered = byDateKey.get(selectedDateKey) ?? [];
      return [{ label: humanizeDateKey(selectedDateKey), items: filtered }];
    }
    const nowMs = Date.now();
    const upcoming = all.filter((a) => new Date(a.dueAt).getTime() >= nowMs);
    const past = all.filter((a) => new Date(a.dueAt).getTime() < nowMs);
    const sections: { label: string; items: CombinedItem[] }[] = [];
    if (upcoming.length > 0) sections.push({ label: 'Upcoming', items: upcoming });
    if (past.length > 0) sections.push({ label: 'Past', items: past });
    return sections;
  }, [data, selectedDateKey, byDateKey]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-3">
        <header className="mb-4 flex items-center justify-between gap-2">
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
            <span className="min-w-[10rem] text-center text-base font-medium text-gray-800">
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
              className="ml-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Today
            </button>
            {refreshing && (
              <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-gray-400" />
            )}
          </div>
        </header>

        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {weekdays.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {grid.map((day) => {
            const dayItems = byDateKey.get(day.dateKey) ?? [];
            const isSelected = selectedDateKey === day.dateKey;
            const hasItems = dayItems.length > 0;
            return (
              <button
                key={day.dateKey}
                type="button"
                onClick={() =>
                  setSelectedDateKey(isSelected ? null : day.dateKey)
                }
                className={[
                  'min-h-[5.5rem] rounded-md p-1.5 text-left text-xs transition',
                  day.inCurrentMonth ? 'text-gray-700' : 'text-gray-300',
                  day.isToday ? 'ring-1 ring-red-500' : '',
                  isSelected
                    ? 'bg-red-50 ring-2 ring-red-500'
                    : hasItems
                      ? 'bg-gray-50 hover:bg-gray-100'
                      : 'hover:bg-gray-50',
                ].join(' ')}
                aria-label={`${day.dateKey}${hasItems ? `, ${dayItems.length} item${dayItems.length === 1 ? '' : 's'}` : ''}`}
                aria-pressed={isSelected}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold">{day.date.getDate()}</span>
                  {hasItems && (
                    <span className="text-[10px] font-medium text-gray-500">
                      {dayItems.length}
                    </span>
                  )}
                </div>
                <ul className="space-y-0.5">
                  {dayItems.slice(0, 2).map((item, i) => {
                    if (item.kind === 'activity') {
                      const a = item.activity;
                      const isDraft = role === 'teacher' && !a.published;
                      return (
                        <li
                          key={`a${i}`}
                          className="flex items-center gap-1 truncate"
                        >
                          {isDraft ? (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full border"
                              style={{
                                borderColor: a.classColor,
                                backgroundColor: 'transparent',
                              }}
                            />
                          ) : (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: a.classColor }}
                            />
                          )}
                          <span className="truncate text-[10px] text-gray-700">
                            {a.title}
                          </span>
                        </li>
                      );
                    }
                    const t = item.task;
                    return (
                      <li
                        key={`t${i}`}
                        className="flex items-center gap-1 truncate"
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: TASK_DOT_COLOR }}
                        />
                        <span className="truncate text-[10px] italic text-slate-600">
                          {t.title}
                        </span>
                      </li>
                    );
                  })}
                  {dayItems.length > 2 && (
                    <li className="text-[10px] font-medium text-gray-500">
                      +{dayItems.length - 2} more
                    </li>
                  )}
                </ul>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            {selectedDateKey ? 'Selected day' : 'This month'}
          </h3>
          {selectedDateKey && (
            <button
              type="button"
              onClick={() => setSelectedDateKey(null)}
              className="text-xs font-medium text-red-600 hover:text-red-700"
            >
              Clear
            </button>
          )}
        </header>

        {sidebarSections.length === 0 ||
        sidebarSections.every((s) => s.items.length === 0) ? (
          <p className="text-sm italic text-gray-500">
            {selectedDateKey
              ? 'Nothing on this day.'
              : 'No items scheduled this month.'}
          </p>
        ) : (
          <div className="space-y-4">
            {sidebarSections.map((section) => (
              <div key={section.label}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  {section.label}
                </p>
                <ul className="space-y-1.5">
                  {section.items.map((item, i) => (
                    <SidebarRow
                      key={`${item.kind}:${i}`}
                      item={item}
                      role={role}
                      classesBasePath={classesBasePath}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

interface SidebarRowProps {
  item: CombinedItem;
  role: 'student' | 'teacher';
  classesBasePath: '/student/classes' | '/teacher/classes';
}

function SidebarRow({ item, role, classesBasePath }: SidebarRowProps) {
  const due = new Date(item.dueAt);
  const timeLabel = due.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const dateLabel = due.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  if (item.kind === 'task') {
    const t = item.task;
    return (
      <li>
        <div className="flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5">
          <span
            className="mt-1 h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: TASK_DOT_COLOR }}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-900">
              {t.title}
            </span>
            <span className="mt-0.5 block text-[11px] text-slate-500">
              <CheckSquare className="mr-1 inline h-3 w-3 align-text-bottom" />
              Personal task
            </span>
            <span className="mt-0.5 block text-[11px] text-slate-400">
              {dateLabel} · {timeLabel}
            </span>
          </span>
        </div>
      </li>
    );
  }

  const a = item.activity;
  const isDraft = role === 'teacher' && !a.published;
  return (
    <li>
      <Link
        href={`${classesBasePath}/${a.classId}/activities/${a.activityId}`}
        className="flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5 hover:border-gray-200 hover:bg-gray-50"
      >
        <span
          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${isDraft ? 'border' : ''}`}
          style={
            isDraft
              ? { borderColor: a.classColor, backgroundColor: 'transparent' }
              : { backgroundColor: a.classColor }
          }
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900">
            {a.title}
          </span>
          <span className="mt-0.5 block truncate text-xs text-gray-500">
            {a.className}
          </span>
          <span className="mt-0.5 block text-[11px] text-gray-400">
            {dateLabel} · {timeLabel}
            {' · '}
            {a.activityKind === 'quiz' ? 'Quiz' : 'Assignment'}
            {isDraft && (
              <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-gray-600">
                Draft
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

function humanizeDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}