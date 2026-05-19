/**
 * Type definitions for the Classes feature.
 * 
 * Schema source of truth: supabase/migrations/20260502010000_classes_and_enrollments.sql
 */

export type UUID = string;

export type Semester = '1st Semester' | '2nd Semester';

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';

export type Track = 'ABM' | 'HUMSS' | 'H.E' | 'ICT';

export type GradeLevel = 'Grade 11' | 'Grade 12';

export const TRACKS: Track[] = ['ABM', 'HUMSS', 'H.E', 'ICT'];

export const GRADE_LEVELS: GradeLevel[] = ['Grade 11', 'Grade 12'];

/**
 * A row in public.classes.
 * Matches the DB schema exactly.
 */
export interface ClassRow {
  id: UUID;
  teacher_id: UUID;
  name: string;
  section: string | null;
  subject_code: string | null; // Kept from original
  semester: Semester;          // Updated to use specific union type
  track: Track | null;
  grade_level: GradeLevel | null;
  description: string | null;
  color: string | null;
  cover_photo_url: string | null;
  invite_code: string;
  invite_code_expires_at: string | null; // ISO timestamp
  invite_code_disabled: boolean;
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
 * Join Requests for classes requiring approval.
 */
export interface ClassJoinRequestRow {
  id: UUID;
  class_id: UUID;
  student_id: UUID;
  status: JoinRequestStatus;
  requested_at: string;
  decided_at: string | null;
  decided_by: UUID | null;
}

// --- UI & View Interfaces ---


/**
 * Lightweight student profile shape used for the avatar strip on class cards.
 */
export interface ClassAvatarInfo {
  id: UUID;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

/**
 * What the teacher's class list view needs (includes enrollment count
 * and a sample of student avatars, pre-fetched server-side).
 */
export interface TeacherClassListItem extends ClassRow {
  enrolled_count: number;
  /**
   * Up to 5 student profiles (4 shown + 1 used to detect overflow).
   * Empty array when no enrollments. Undefined when this row was
   * constructed client-side (e.g. just-created class) — render as empty.
   */
  avatars?: ClassAvatarInfo[];
}

export interface StudentClassListItem {
  id: UUID;
  name: string;
  section: string | null;
  semester: Semester;
  color: string | null;
  cover_photo_url: string | null;
  teacher_name: string | null;
  enrolled_at: string;
  is_archived: boolean;
  /**
   * Classmate profiles (excluding self). Up to 5, populated server-side.
   * Empty when no classmates or RLS hides the roster.
   */
  avatars?: ClassAvatarInfo[];
}

/**
 * Pending request enriched with student profile info, for the teacher UI
 */
export interface PendingJoinRequest extends ClassJoinRequestRow {
  student_full_name: string | null;
  student_email: string | null;
  student_avatar_url: string | null;
}

// --- Inputs & Actions ---

/**
 * Form input for creating / editing a class
 */
export interface ClassFormInput {
  name: string;
  section: string | null;
  semester: Semester;
  track: Track | null;
  grade_level: GradeLevel | null;
  subject_code?: string;
  description?: string | null;
  color?: string | null;
  cover_photo_url?: string | null;
}

/**
 * Discriminated-union return type for all server actions.
 */
export type ActionResult<T = void> = 
  | { ok: true; data: T } 
  | { ok: false; error: string };

// --- Constants & Helpers ---

/**
 * Preset expiration windows (in hours) the teacher can pick when regenerating
 */
export const INVITE_EXPIRATION_PRESETS = [
  { label: '24 hours', hours: 24 },
  { label: '7 days',   hours: 24 * 7 },
  { label: '30 days',  hours: 24 * 30 },
  { label: 'Never',    hours: null },
] as const;


export type InviteExpirationHours = number | null;

/**
 * 10 pastel colors for class cards. Each is a Tailwind-friendly hex string.
 */
export const CLASS_COLORS = [
  '#FCA5A5', // red-300
  '#FDBA74', // orange-300
  '#FCD34D', // amber-300
  '#86EFAC', // green-300
  '#67E8F9', // cyan-300
  '#93C5FD', // blue-300
  '#C4B5FD', // violet-300
  '#F0ABFC', // fuchsia-300
  '#F9A8D4', // pink-300
  '#D6D3D1', // stone-300
] as const;

export const DEFAULT_CLASS_COLOR = CLASS_COLORS[0];


/**

 * Pick a deterministic color from the palette.
 */
export function pickClassColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % CLASS_COLORS.length;
  return CLASS_COLORS[index];
}
