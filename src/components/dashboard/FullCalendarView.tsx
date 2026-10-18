'use client';

import {
  useState,
  useEffect,
  useMemo,
  useTransition,
  useCallback,
} from 'react';
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

// Item shape unified for grid + sidebar rendering.
type CombinedItem =
  | { kind: 'activity'; activity: CalendarActivity; dueAt: string }
  | { kind: 'task'; task: CalendarPersonalTask; dueAt: string };

const CARD =
  'rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

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

  const totalUpcoming = useMemo(() => {
    const nowMs = Date.now();
    return (
      data.activities.filter((a) => new Date(a.dueAt).getTime() >= nowMs).length +
      data.personalTasks.filter((t) => new Date(t.dueAt).getTime() >= nowMs).length
    );
  }, [data]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      {/* ---------------- Month grid ---------------- */}
      <section className={`overflow-hidden ${CARD}`}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <h2 className="text-xl font-extrabold tracking-tight text-zinc-900">
              {formatMonthLabel(year, month0)}
            </h2>
            <div className="flex items-center gap-4 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-600" />
                Class deadline
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-zinc-900" />
                Personal task
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {refreshing && <Loader2 className="mr-1 h-4 w-4 animate-spin text-zinc-400" />}
            <button
              type="button"
              onClick={handleToday}
              disabled={refreshing}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3.5 text-[13px] font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handlePrev}
              disabled={refreshing}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={refreshing}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        {error && (
          <div className="border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-700">{error}</div>
        )}

        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-zinc-100 bg-zinc-50/70">
          {weekdays.map((w, i) => (
            <div
              key={w}
              className={`px-2.5 py-2.5 text-xs font-semibold text-zinc-400 ${i < 6 ? 'border-r border-zinc-100' : ''}`}
            >
              {w}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7">
          {grid.map((day, idx) => {
            const dayItems = byDateKey.get(day.dateKey) ?? [];
            const isSelected = selectedDateKey === day.dateKey;
            const hasItems = dayItems.length > 0;
            const col = idx % 7;
            const isWeekend = col === 0 || col === 6;
            const isLastRow = idx >= grid.length - 7;

            return (
              <button
                key={day.dateKey}
                type="button"
                onClick={() => setSelectedDateKey(isSelected ? null : day.dateKey)}
                className={[
                  'flex min-h-[6.5rem] min-w-0 flex-col gap-1 p-2 text-left transition',
                  col < 6 ? 'border-r border-zinc-100' : '',
                  isLastRow ? '' : 'border-b border-zinc-100',
                  isSelected
                    ? 'bg-red-50/60 ring-2 ring-inset ring-red-400'
                    : !day.inCurrentMonth
                      ? 'bg-zinc-50/60 hover:bg-zinc-50'
                      : isWeekend
                        ? 'bg-zinc-50/30 hover:bg-zinc-50'
                        : 'bg-white hover:bg-zinc-50',
                ].join(' ')}
                aria-label={`${day.dateKey}${hasItems ? `, ${dayItems.length} item${dayItems.length === 1 ? '' : 's'}` : ''}`}
                aria-pressed={isSelected}
              >
                <span
                  className={[
                    'flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold',
                    day.isToday
                      ? 'bg-red-600 text-white'
                      : day.inCurrentMonth
                        ? 'text-zinc-700'
                        : 'text-zinc-300',
                  ].join(' ')}
                >
                  {day.date.getDate()}
                </span>

                {dayItems.slice(0, 2).map((item, i) => (
                  <DayChip key={`${item.kind}${i}`} item={item} role={role} />
                ))}
                {dayItems.length > 2 && (
                  <span className="px-1 text-[11px] font-medium text-zinc-500">
                    +{dayItems.length - 2} more
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------------- Sidebar ---------------- */}
      <aside className={`p-5 ${CARD}`}>
        <header className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-base font-extrabold text-zinc-900">
            {selectedDateKey ? 'Selected day' : 'This month'}
          </h3>
          {selectedDateKey ? (
            <button
              type="button"
              onClick={() => setSelectedDateKey(null)}
              className="text-xs font-semibold text-red-600 hover:text-red-700"
            >
              Clear
            </button>
          ) : (
            <span className="text-xs text-zinc-400">{totalUpcoming} upcoming</span>
          )}
        </header>

        {sidebarSections.length === 0 ||
        sidebarSections.every((s) => s.items.length === 0) ? (
          <p className="py-6 text-center text-sm text-zinc-500">
            {selectedDateKey ? 'Nothing on this day.' : 'No items scheduled this month.'}
          </p>
        ) : (
          <div className="space-y-5">
            {sidebarSections.map((section) => (
              <div key={section.label}>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400">
                  {section.label}
                </p>
                {groupByDay(section.items).map((group) => (
                  <div key={group.key} className="mt-3">
                    {!selectedDateKey && (
                      <p className="mb-2 text-xs font-semibold text-zinc-500">{group.label}</p>
                    )}
                    <ul className="space-y-2">
                      {group.items.map((item, i) => (
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
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chip shown inside a day cell
// ---------------------------------------------------------------------------

function DayChip({ item, role }: { item: CombinedItem; role: 'student' | 'teacher' }) {
  if (item.kind === 'task') {
    return (
      <span className="flex min-w-0 items-center gap-1.5 rounded-md bg-zinc-100 px-1.5 py-1 text-[11.5px] font-semibold text-zinc-700">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-900" />
        <span className="truncate">{item.task.title}</span>
      </span>
    );
  }
  const a = item.activity;
  const isDraft = role === 'teacher' && !a.published;
  return (
    <span
      className={`flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[11.5px] font-semibold ${
        isDraft
          ? 'border border-dashed border-zinc-300 bg-white text-zinc-500'
          : 'bg-red-50 text-red-800'
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isDraft ? 'bg-zinc-300' : 'bg-red-600'}`} />
      <span className="truncate">{a.title}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sidebar row
// ---------------------------------------------------------------------------

interface SidebarRowProps {
  item: CombinedItem;
  role: 'student' | 'teacher';
  classesBasePath: '/student/classes' | '/teacher/classes';
}

function SidebarRow({ item, role, classesBasePath }: SidebarRowProps) {
  const due = new Date(item.dueAt);
  const timeLabel = due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (item.kind === 'task') {
    const t = item.task;
    return (
      <li className="rounded-xl border border-zinc-100 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-900" />
          <span className="truncate text-sm font-bold text-zinc-900">{t.title}</span>
        </div>
        <p className="ml-4 mt-0.5 text-xs text-zinc-500">Personal task · {timeLabel}</p>
      </li>
    );
  }

  const a = item.activity;
  const isDraft = role === 'teacher' && !a.published;
  return (
    <li>
      <Link
        href={`${classesBasePath}/${a.classId}/activities/${a.activityId}`}
        className="block rounded-xl border border-zinc-100 px-3 py-2.5 transition hover:border-zinc-200 hover:bg-zinc-50"
      >
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${isDraft ? 'border border-zinc-400' : 'bg-red-600'}`} />
          <span className="truncate text-sm font-bold text-zinc-900">{a.title}</span>
          {isDraft && (
            <span className="ml-auto shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
              Draft
            </span>
          )}
        </div>
        <p className="ml-4 mt-0.5 truncate text-xs text-zinc-500">
          {a.className} · {a.activityKind === 'quiz' ? 'Quiz' : 'Activity'} · {timeLabel}
        </p>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByDay(items: CombinedItem[]) {
  const groups: { key: string; label: string; items: CombinedItem[] }[] = [];
  for (const item of items) {
    const d = new Date(item.dueAt);
    const key = toLocalDateKey(d);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = {
        key,
        label: d
          .toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
          .toUpperCase(),
        items: [],
      };
      groups.push(g);
    }
    g.items.push(item);
  }
  return groups;
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