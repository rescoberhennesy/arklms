// src/lib/utils/calendar.ts
//
// Pure date helpers for the dashboard calendar widget. Self-contained;
// no DOM, no React, no async. Everything is in the user's LOCAL timezone
// — the calendar shows a month as the user sees it, not as UTC.

/** A single day in the month grid. */
export interface MonthGridDay {
  date: Date;          // Local midnight at the start of this day
  dateKey: string;     // 'YYYY-MM-DD' in local time, stable key for maps
  inCurrentMonth: boolean;
  isToday: boolean;
}

/** Local 'YYYY-MM-DD' key for a Date. Used to group activities by day. */
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local midnight at the start of `d`. */
export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** First day of the given month (local time). */
export function startOfMonth(year: number, month0: number): Date {
  return new Date(year, month0, 1, 0, 0, 0, 0);
}

/** First day of the NEXT month (exclusive upper bound). */
export function startOfNextMonth(year: number, month0: number): Date {
  return new Date(year, month0 + 1, 1, 0, 0, 0, 0);
}

/**
 * Build a 6-row × 7-column grid of MonthGridDay covering the visible month.
 * Always returns 42 days so the layout never shifts row count.
 * Leading days fill from the previous month, trailing from the next.
 *
 * weekStartsOn: 0 = Sunday (default, US/PH convention), 1 = Monday.
 */
export function getMonthGrid(
  year: number,
  month0: number,
  weekStartsOn: 0 | 1 = 0,
): MonthGridDay[] {
  const first = startOfMonth(year, month0);
  const todayKey = toLocalDateKey(startOfDay(new Date()));

  // How many leading days from the previous month do we need?
  // Sun=0..Sat=6 by default. If weekStartsOn=1, shift so Mon=0..Sun=6.
  const firstDayOfWeek = first.getDay();
  const lead =
    weekStartsOn === 0
      ? firstDayOfWeek
      : (firstDayOfWeek + 6) % 7;

  // Start render at lead-days before the 1st.
  const start = new Date(first);
  start.setDate(first.getDate() - lead);

  const days: MonthGridDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = toLocalDateKey(d);
    days.push({
      date: d,
      dateKey: key,
      inCurrentMonth: d.getMonth() === month0,
      isToday: key === todayKey,
    });
  }
  return days;
}

/** Localized month label, e.g. "May 2026". */
export function formatMonthLabel(year: number, month0: number): string {
  return new Date(year, month0, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

/** Add `delta` months to (year, month0); returns normalized values. */
export function addMonths(
  year: number,
  month0: number,
  delta: number,
): { year: number; month0: number } {
  const d = new Date(year, month0 + delta, 1);
  return { year: d.getFullYear(), month0: d.getMonth() };
}

/** ISO string for the first instant of the given month (UTC equivalent of local midnight). */
export function isoMonthStart(year: number, month0: number): string {
  return startOfMonth(year, month0).toISOString();
}

/** ISO string for the first instant of the next month. */
export function isoMonthEnd(year: number, month0: number): string {
  return startOfNextMonth(year, month0).toISOString();
}

/** Day-of-week header labels respecting weekStartsOn. */
export function getWeekdayHeaders(weekStartsOn: 0 | 1 = 0): string[] {
  const sun = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (weekStartsOn === 0) return sun;
  return [...sun.slice(1), sun[0]];
}