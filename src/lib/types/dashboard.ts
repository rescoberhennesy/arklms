// src/lib/types/dashboard.ts
//
// Pure types for the dashboard widgets. Calendar items, to-do rows,
// personal tasks, and cross-class announcement rows.
// No async functions, no server-only code.

import type { ActivityKind } from '@/lib/types/activities';

// ==========================================================================
// CALENDAR
// ==========================================================================

export interface CalendarActivity {
  activityId: string;
  classId: string;
  className: string;
  classColor: string;
  title: string;
  activityKind: ActivityKind;
  dueAt: string;
  published: boolean;
}

// Personal tasks also surface on the calendar (when they have a due_at).
// Rendered with a neutral slate-gray dot — distinct from class-color
// activity dots. No classId/className since they're not class-scoped.
export interface CalendarPersonalTask {
  taskId: string;
  title: string;
  dueAt: string; // ISO — only items with non-null due_at surface here
}

// ==========================================================================
// TO-DO ROWS — STUDENT
// ==========================================================================

export interface StudentTodoItem {
  activityId: string;
  classId: string;
  className: string;
  title: string;
  activityKind: ActivityKind;
  dueAt: string;
  isOverdue: boolean;
  quizState: 'not_started' | 'in_progress' | null;
  lateAllowed: boolean;
}

// ==========================================================================
// TO-DO ROWS — TEACHER
// ==========================================================================

export type TeacherTodoKind =
  | 'submission_ungraded'
  | 'quiz_manual_pending'
  | 'class_deadline';

export interface TeacherTodoItem {
  kind: TeacherTodoKind;
  activityId: string;
  classId: string;
  className: string;
  activityTitle: string;
  submissionId: string | null;
  attemptId: string | null;
  studentName: string | null;
  studentEmail: string | null;
  sortKey: string;
  isDraftGrade: boolean;
}

// ==========================================================================
// PERSONAL TASKS (shared between teachers and students)
// ==========================================================================

// One row in the personal-tasks subsection of the to-do widget.
// Soft-deleted rows (completed_at NOT NULL) are filtered upstream by
// the action; this type only carries active tasks.
//
// `dueAt` is nullable — undated tasks still appear in the widget but
// don't surface on the calendar. `isOverdue` is computed server-side
// for dated tasks; null for undated.
export interface PersonalTaskItem {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null; // ISO or null
  isOverdue: boolean | null; // null when undated
  createdAt: string;
}

// ==========================================================================
// ANNOUNCEMENTS — CROSS-CLASS DASHBOARD WIDGET
// ==========================================================================

export interface RecentAnnouncementItem {
  id: string;
  classId: string;
  className: string;
  classColor: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  authorName: string | null;
}