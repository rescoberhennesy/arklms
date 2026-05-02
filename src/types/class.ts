/**
 * Type definitions for the Classes feature.
 *
 * Schema source of truth: supabase/migrations/20260502010000_classes_and_enrollments.sql
 * Keep these in sync if you change the migration.
 */

export type UUID = string;

/**
 * A row in public.classes.
 * Matches the DB schema exactly (snake_case to match Postgres columns).
 */
export interface ClassRow {
  id: UUID;
  teacher_id: UUID;
  name: string;
  section: string | null;
  subject_code: string | null;
  semester: string;
  description: string | null;
  color: string;          // hex like "#dc2626"
  invite_code: string;    // 7-char, e.g., "gabxk2p"
  is_archived: boolean;
  created_at: string;     // ISO timestamp
  updated_at: string;
}

/**
 * Row in public.class_enrollments.
 */
export interface ClassEnrollmentRow {
  id: UUID;
  class_id: UUID;
  student_id: UUID;
  enrolled_at: string;
}

/**
 * Shape of the data the Create Class form sends to the server.
 * `name` and `semester` are required; everything else is optional.
 */
export interface CreateClassInput {
  name: string;
  semester: string;
  section?: string;
  subject_code?: string;
  description?: string;
}

/**
 * Discriminated-union return type for all server actions.
 * Lets the client narrow on `ok` to safely access `data` or `error`.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Predefined palette for auto-assigning a class color on creation.
 * Roughly matches Google Classroom's vibrant, distinguishable hues
 * but biased toward the ARK red/warm theme.
 */
export const CLASS_COLOR_PALETTE: readonly string[] = [
  '#dc2626', // red-600 (theme primary)
  '#ea580c', // orange-600
  '#d97706', // amber-600
  '#65a30d', // lime-600
  '#0891b2', // cyan-600
  '#2563eb', // blue-600
  '#7c3aed', // violet-600
  '#db2777', // pink-600
] as const;

/**
 * Pick a deterministic color from the palette so the same class
 * always shows the same color even if we recompute on the client.
 */
export function pickClassColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % CLASS_COLOR_PALETTE.length;
  return CLASS_COLOR_PALETTE[index];
}