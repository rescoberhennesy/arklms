// src/lib/types/dashboard.ts
//
// Pure types for the dashboard widgets (Phase 8c). Calendar items and
// to-do rows. No async functions, no server-only code.

import type { ActivityKind } from '@/lib/types/activities';

// ==========================================================================
// CALENDAR
// ==========================================================================

// One activity surfacing as a dot on the calendar. The widget groups by
// dueDate (yyyy-mm-dd in user's local time, computed client-side from
// dueAt) for the dot rendering, then renders the full item list when a
// day is expanded.
export interface CalendarActivity {
  activityId: string;
  classId: string;
  className: string;
  classColor: string;
  title: string;
  activityKind: ActivityKind;
  dueAt: string; // ISO
  // Teacher-only: surfaces drafts with a visual distinction.
  // For students this is always true (only published rows are returned).
  published: boolean;
}

// ==========================================================================
// TO-DO ROWS — STUDENT
// ==========================================================================

// One row in the student "Due soon" widget. Covers:
//   - assignments not yet submitted that are due in the next 7 days OR overdue
//   - quizzes the student has not started/submitted that are due in the
//     next 7 days OR overdue
//
// "Overdue" means the activity's due_at is in the past AND the student
// hasn't submitted (assignment) or hasn't submitted a quiz attempt.
// Allow_late=true assignments that are past due AND unsubmitted still
// show as overdue (the row tells the student to act now).
export interface StudentTodoItem {
  activityId: string;
  classId: string;
  className: string;
  title: string;
  activityKind: ActivityKind;
  dueAt: string; // ISO
  isOverdue: boolean; // due_at < now AND nothing submitted
  // For quizzes: 'not_started' (no attempt row), 'in_progress' (attempt
  // exists, not submitted). For assignments: always 'not_started' because
  // any submission would have removed the row.
  quizState: 'not_started' | 'in_progress' | null;
  // True iff allow_late is true AND due_at < now. Surfaces as "late
  // submission OK" hint on the row.
  lateAllowed: boolean;
}

// ==========================================================================
// TO-DO ROWS — TEACHER
// ==========================================================================

// One row in the teacher "To grade" widget. Two row types:
//   - 'submission_ungraded': an assignment submission with no grade yet,
//     OR a grade saved as draft (returned_at IS NULL).
//   - 'quiz_manual_pending': a submitted quiz attempt with at least one
//     essay/short_answer response where manual_points IS NULL.
//
// Both types link to a grader UI: the submission grader for the first,
// the quiz-attempt grader for the second.
export type TeacherTodoKind = 'submission_ungraded' | 'quiz_manual_pending';

export interface TeacherTodoItem {
  kind: TeacherTodoKind;
  activityId: string;
  classId: string;
  className: string;
  activityTitle: string;
  // For 'submission_ungraded': the submission id and student info
  submissionId: string | null;
  // For 'quiz_manual_pending': the attempt id and student info
  attemptId: string | null;
  studentName: string | null;
  studentEmail: string | null;
  // The relevant timestamp:
  //   submission_ungraded → submitted_at
  //   quiz_manual_pending → attempt.submitted_at
  // Used for sort order ("most recent first").
  sortKey: string; // ISO
  // For submission_ungraded: true iff a draft grade exists but is unreleased.
  // For quiz_manual_pending: always false.
  isDraftGrade: boolean;
}