// Shared grading helpers (safe for server and client).

export type GradingMethod = 'raw' | 'deped';

/** DepEd transmutation (DO 8, s. 2015): raw 60 → 75, raw 100 → 100. */
export function transmute(raw: number): number {
  const r = Math.max(0, Math.min(100, raw));
  if (r >= 60) return Math.min(100, 75 + Math.floor((r - 60) / 1.6));
  return 60 + Math.floor(r / 4);
}

export type Standing = 'pass' | 'near' | 'risk';

/** Passing = at/above passing grade; Near = up to 10 below; else At risk. */
export function standingOf(grade: number, passing: number): Standing {
  if (grade >= passing) return 'pass';
  if (grade >= passing - 10) return 'near';
  return 'risk';
}

export function formatGrade(value: number | null, method: GradingMethod): string {
  if (value === null) return '—';
  return method === 'deped' ? String(Math.round(value)) : `${value.toFixed(1)}%`;
}