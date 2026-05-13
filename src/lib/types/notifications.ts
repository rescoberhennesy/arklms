// src/lib/types/notifications.ts
//
// Session 13 — notifications surface.
//
// The set of types is a TS union (not a DB enum) so we can add new
// trigger sources without migrations. Each constant maps to one inserter
// helper in src/lib/actions/notifications.ts.

import type { LucideIcon } from 'lucide-react';
import {
  Megaphone,
  MessageSquare,
  Inbox,
  Award,
  UserPlus,
  UserCheck,
  BookOpen,
  FileText,
  ClipboardList,
} from 'lucide-react';

export const NOTIFICATION_TYPES = [
  // Announcements
  'announcement_new',         // teacher posted → student
  'announcement_comment',     // someone commented → participants in thread

  // Submissions & grades
  'submission_new',           // student submitted → teacher
  'grade_released',           // teacher released grade → student

  // Enrollments
  'join_request_new',         // student requested → teacher
  'join_request_decided',     // teacher approved/rejected → student

  // Course materials
  'module_new',               // teacher created module → enrolled students
  'lesson_published',         // teacher published lesson → enrolled students
  'activity_published',       // teacher published activity → enrolled students
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// Stored shape (server-side, what's in the DB after mapping).
export interface NotificationRow {
  id: string;
  userId: string;
  type: NotificationType;
  refId: string | null;
  title: string;
  body: string | null;
  linkPath: string;
  readAt: string | null;   // ISO timestamp
  createdAt: string;       // ISO timestamp
}

// Lightweight shape passed to the bell UI.
export interface NotificationDropdownData {
  items: NotificationRow[];   // newest 10
  unreadCount: number;        // total unread, may exceed items.length
}

// UI metadata for each type — icon + accent color. Drives bell row rendering.
export interface NotificationDisplayMeta {
  icon: LucideIcon;
  iconClassName: string;
}

export const NOTIFICATION_DISPLAY: Record<NotificationType, NotificationDisplayMeta> = {
  announcement_new: {
    icon: Megaphone,
    iconClassName: 'text-blue-600 bg-blue-50',
  },
  announcement_comment: {
    icon: MessageSquare,
    iconClassName: 'text-blue-600 bg-blue-50',
  },
  submission_new: {
    icon: Inbox,
    iconClassName: 'text-purple-600 bg-purple-50',
  },
  grade_released: {
    icon: Award,
    iconClassName: 'text-green-600 bg-green-50',
  },
  join_request_new: {
    icon: UserPlus,
    iconClassName: 'text-amber-600 bg-amber-50',
  },
  join_request_decided: {
    icon: UserCheck,
    iconClassName: 'text-amber-600 bg-amber-50',
  },
  module_new: {
    icon: BookOpen,
    iconClassName: 'text-rose-600 bg-rose-50',
  },
  lesson_published: {
    icon: FileText,
    iconClassName: 'text-rose-600 bg-rose-50',
  },
  activity_published: {
    icon: ClipboardList,
    iconClassName: 'text-rose-600 bg-rose-50',
  },
};
