// src/lib/types/activities.ts
//
// Phase 8a Layer B — type definitions for activities feature.
// Lives outside 'use server' actions file because action files can only
// export async functions; constants/enums must live in a separate types file.

import type { ModuleTerm } from '@/lib/types/modules';

// Enum mirrors of Postgres types -------------------------------------------

export const ACTIVITY_KINDS = ['assignment', 'quiz'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  assignment: 'Assignment',
  quiz: 'Quiz',
};

export const SUBMISSION_TYPES = ['file', 'text', 'both', 'none'] as const;
export type SubmissionType = (typeof SUBMISSION_TYPES)[number];

export const SUBMISSION_TYPE_LABELS: Record<SubmissionType, string> = {
  file: 'File upload',
  text: 'Text response',
  both: 'File and text',
  none: 'No submission (graded by teacher)',
};

// Activity status — computed server-side, surfaced to UI ---------------------

export const ACTIVITY_STATUSES = [
  'not_started', // start_at in future (teacher view only; student can't see it)
  'open', // in submission window, no submission yet
  'late_window', // past due_at, allow_late = true, no submission yet
  'missing', // past due_at, no submission, no late grace
  'submitted', // submitted on time, no grade
  'late_submitted', // submitted late, no grade
  'graded_unreturned', // graded, not yet released to student (teacher view)
  'graded_returned', // graded and released
] as const;

export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  not_started: 'Not started',
  open: 'Open',
  late_window: 'Late accepted',
  missing: 'Missing',
  submitted: 'Submitted',
  late_submitted: 'Submitted (late)',
  graded_unreturned: 'Graded',
  graded_returned: 'Graded',
};

// Core row shapes -----------------------------------------------------------

export interface Activity {
  id: string;
  classId: string;
  term: ModuleTerm;
  activityKind: ActivityKind;
  title: string;
  description: string;
  maxPoints: number;
  startAt: string; // ISO timestamp
  dueAt: string; // ISO timestamp
  allowLate: boolean;
  allowResubmission: boolean;
  submissionType: SubmissionType;
  published: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionAttachment {
  id: string;
  submissionId: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}

export interface ActivitySubmission {
  id: string;
  activityId: string;
  studentId: string;
  submittedAt: string;
  textBody: string | null;
  isLate: boolean;
  updatedAt: string;
  attachments: SubmissionAttachment[];
}

export interface ActivityGrade {
  id: string;
  submissionId: string;
  score: number;
  feedback: string;
  gradedBy: string;
  gradedAt: string;
  returnedAt: string | null;
}

// Joined shapes returned by list/get actions --------------------------------

export interface ActivityWithStudentState extends Activity {
  // Student's own submission/grade (or null), plus computed status
  submission: ActivitySubmission | null;
  grade: ActivityGrade | null;
  status: ActivityStatus;
}

export interface SubmissionWithGrade extends ActivitySubmission {
  grade: ActivityGrade | null;
  studentName: string;
  studentEmail: string;
}

export interface ActivityWithAllSubmissions extends Activity {
  submissions: SubmissionWithGrade[];
}

// Class grade weights -------------------------------------------------------

export interface ClassGradeWeights {
  classId: string;
  prelimPct: number;
  midtermPct: number;
  prefinalPct: number;
  finalPct: number;
  createdAt: string;
  updatedAt: string;
}

// Default weights when none configured. NOT inserted by default — absence of
// row in class_grade_weights means "unweighted fallback" in the calculator.
// This constant is just the seed used when the teacher clicks "configure
// weights" and we need to show them an initial value.
export const DEFAULT_GRADE_WEIGHTS: Omit <
  ClassGradeWeights,
  'classId' | 'createdAt' | 'updatedAt'
> = {
  prelimPct: 25,
  midtermPct: 25,
  prefinalPct: 25,
  finalPct: 25,
};

// Attachment metadata for submitActivity ------------------------------------

export interface SubmissionAttachmentInput {
  path: string;
  name: string;
  size: number;
  mimeType: string;
}

// Status computation --------------------------------------------------------
// Pure function — no DB calls. Used by listActivitiesForStudent and
// listActivitiesForTeacher to attach a status to each row.

export function computeActivityStatus(
  activity: Activity,
  submission: ActivitySubmission | null,
  grade: ActivityGrade | null,
  viewerRole: 'student' | 'teacher',
): ActivityStatus {
  const now = Date.now();
  const startAt = new Date(activity.startAt).getTime();
  const dueAt = new Date(activity.dueAt).getTime();

  // Teacher sees not_started rows; student RLS hides them entirely so they'd
  // never reach this code path with a not-yet-started activity.
  if (now < startAt) return 'not_started';

  // Has a grade?
  if (grade) {
    // Teacher always sees the actual returned/unreturned distinction.
    // Student only ever sees grades that have been returned (RLS), so for
    // them an existing grade row implies it's returned.
    if (viewerRole === 'teacher') {
      return grade.returnedAt ? 'graded_returned' : 'graded_unreturned';
    }
    return 'graded_returned';
  }

  // Has a submission, no grade?
  if (submission) {
    return submission.isLate ? 'late_submitted' : 'submitted';
  }

  // No submission. Past due?
  if (now > dueAt) {
    return activity.allowLate ? 'late_window' : 'missing';
  }

  return 'open';
}