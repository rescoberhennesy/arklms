// src/lib/manilaTime.ts
// The Vercel server runs on UTC. Always compute greetings/dates in Philippine time.

const TZ = 'Asia/Manila';

function part(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...opts }).format(date);
}

/** Current hour (0–23) in Manila */
export function manilaHour(date: Date = new Date()): number {
  return Number(part(date, { hour: 'numeric', hourCycle: 'h23' }));
}

/** "Good morning" / "Good afternoon" / "Good evening" in Manila time */
export function manilaGreeting(date: Date = new Date()): string {
  const h = manilaHour(date);
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** e.g. "Thu, Oct 22" */
export function manilaShortDate(date: Date = new Date()): string {
  return part(date, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Day of month in Manila, e.g. 22 */
export function manilaDay(date: Date = new Date()): number {
  return Number(part(date, { day: 'numeric' }));
}

/** Year and 0-based month in Manila (same shape as getFullYear()/getMonth()) */
export function manilaYearMonth(date: Date = new Date()): { year: number; month: number } {
  return {
    year: Number(part(date, { year: 'numeric' })),
    month: Number(part(date, { month: 'numeric' })) - 1,
  };
}