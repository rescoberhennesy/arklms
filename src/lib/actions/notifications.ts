'use server';

// src/lib/actions/notifications.ts
//
// Session 13 — notifications surface.
//
// This file contains:
//   1. READ actions (called from server components / client via server action):
//      - getNotificationDropdownData(): newest 10 + unread count, for the bell
//      - markNotificationRead(id): set read_at on a single row
//      - markAllNotificationsRead(): bulk update for current user
//
//   2. INSERTER HELPERS (called from other server actions to fan out notifs):
//      - notifyAnnouncementCreated, notifyAnnouncementComment,
//        notifySubmissionCreated, notifyGradeReleased, notifyGradesReleased,
//        notifyJoinRequestCreated, notifyJoinRequestDecided,
//        notifyModuleCreated, notifyLessonPublished, notifyActivityPublished
//
// Inserters run in the calling server action's session. The notifications
// INSERT policy is permissive (any authenticated user can insert for any
// user_id) — see the migration for rationale. Errors during inserter calls
// are logged but NOT thrown, so a fan-out failure doesn't break the parent
// action (e.g. an announcement still posts even if notification fan-out
// fails for one student).

import { createClient } from '@/lib/supabase/server';
import type {
  NotificationRow,
  NotificationDropdownData,
  NotificationType,
} from '@/lib/types/notifications';

// Dropdown returns this many newest items; the unread badge counts ALL
// unread, not just within these 10.
const DROPDOWN_LIMIT = 10;

interface NotificationDbRow {
  id: string;
  user_id: string;
  type: string;
  ref_id: string | null;
  title: string;
  body: string | null;
  link_path: string;
  read_at: string | null;
  created_at: string;
}

function mapNotification(r: NotificationDbRow): NotificationRow {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type as NotificationType,
    refId: r.ref_id,
    title: r.title,
    body: r.body,
    linkPath: r.link_path,
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

// =============================================================================
// READS — called from server components or client via server actions
// =============================================================================

// Newest N notifications + unread count, for the bell dropdown. Returns
// empty data if the user is not authenticated rather than throwing, so the
// bell server-component wrapper doesn't crash on a logged-out edge case.
export async function getNotificationDropdownData(): Promise<NotificationDropdownData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { items: [], unreadCount: 0 };

  // Parallel: fetch the dropdown items and the unread count.
  // unread count is a separate query (HEAD + count) so we can show
  // "12 unread" even when only 10 fit in the dropdown.
  const [itemsRes, countRes] = await Promise.all([
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(DROPDOWN_LIMIT),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null),
  ]);

  if (itemsRes.error) {
    console.error('[notifications] dropdown fetch error:', itemsRes.error.message);
    return { items: [], unreadCount: 0 };
  }
  if (countRes.error) {
    console.error('[notifications] unread count error:', countRes.error.message);
  }

  const items = ((itemsRes.data ?? []) as NotificationDbRow[]).map(mapNotification);
  return {
    items,
    unreadCount: countRes.count ?? 0,
  };
}

// Mark a single notification as read. No-op if it's already read or doesn't
// belong to the caller (RLS will silently filter it out).
export async function markNotificationRead(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);
  if (error) throw new Error(`Failed to mark read: ${error.message}`);
}

// Mark all of the current user's unread notifications as read.
export async function markAllNotificationsRead(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error, count } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() }, { count: 'exact' })
    .eq('user_id', user.id)
    .is('read_at', null);
  if (error) throw new Error(`Failed to mark all read: ${error.message}`);
  return count ?? 0;
}

// =============================================================================
// INSERTER HELPERS
//
// Each helper is called from a trigger source's server action. They build
// a list of recipient user_ids, look up display metadata (titles, link
// paths), and bulk-insert one row per recipient.
//
// All helpers swallow errors (log + return) rather than throw, so that a
// notification failure doesn't roll back the parent action. This is a
// deliberate trade-off: better to silently lose a notification than to
// fail to post an announcement because one student's profile was deleted.
// =============================================================================

interface InsertInput {
  userId: string;
  type: NotificationType;
  refId: string | null;
  title: string;
  body?: string | null;
  linkPath: string;
}

async function bulkInsertNotifications(rows: InsertInput[]): Promise<void> {
  if (rows.length === 0) return;
  const supabase = await createClient();
  const payload = rows.map((r) => ({
    user_id: r.userId,
    type: r.type,
    ref_id: r.refId,
    title: r.title,
    body: r.body ?? null,
    link_path: r.linkPath,
  }));
  const { error } = await supabase.from('notifications').insert(payload);
  if (error) {
    console.error('[notifications] bulk insert error:', error.message);
  }
}

// ----- (a) Announcement created → all enrolled students of the class -----
export async function notifyAnnouncementCreated(params: {
  announcementId: string;
  classId: string;
  className: string;
  authorName: string;
  titlePreview: string;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: enrollments, error } = await supabase
      .from('class_enrollments')
      .select('student_id')
      .eq('class_id', params.classId);
    if (error) {
      console.error('[notifications] enrollments lookup error:', error.message);
      return;
    }
    const recipients = (enrollments ?? []) as Array<{ student_id: string }>;
    const rows: InsertInput[] = recipients.map((r) => ({
      userId: r.student_id,
      type: 'announcement_new',
      refId: params.announcementId,
      title: `${params.authorName} posted in ${params.className}`,
      body: params.titlePreview,
      linkPath: `/student/classes/${params.classId}?tab=stream`,
    }));
    await bulkInsertNotifications(rows);
  } catch (e) {
    console.error('[notifications] notifyAnnouncementCreated failed:', e);
  }
}

// ----- (a, continued) Announcement comment → thread participants -----
//
// "Participants" = announcement author + everyone who has commented so far,
// MINUS the current commenter. Both teacher- and student-side users are
// in this set; the link path needs to route correctly for each. We look up
// each recipient's role from profiles to build the right URL.
export async function notifyAnnouncementComment(params: {
  announcementId: string;
  classId: string;
  className: string;
  commenterId: string;
  commenterName: string;
  commentPreview: string;
}): Promise<void> {
  try {
    const supabase = await createClient();

    // Announcement author
    const { data: annData, error: annErr } = await supabase
      .from('class_announcements')
      .select('author_id')
      .eq('id', params.announcementId)
      .maybeSingle();
    if (annErr) {
      console.error('[notifications] announcement lookup error:', annErr.message);
      return;
    }
    const authorId = (annData as { author_id: string | null } | null)?.author_id ?? null;

    // All distinct comment authors so far
    const { data: commentAuthors, error: caErr } = await supabase
      .from('announcement_comments')
      .select('author_id')
      .eq('announcement_id', params.announcementId);
    if (caErr) {
      console.error('[notifications] comment authors error:', caErr.message);
      return;
    }
    const commenterIds = new Set<string>();
    for (const c of (commentAuthors ?? []) as Array<{ author_id: string | null }>) {
      if (c.author_id) commenterIds.add(c.author_id);
    }

    // Participants minus the current commenter
    const participants = new Set<string>(commenterIds);
    if (authorId) participants.add(authorId);
    participants.delete(params.commenterId);

    if (participants.size === 0) return;

    // Look up each participant's role to build correct link path
    const ids = Array.from(participants);
    const { data: profileRows, error: pErr } = await supabase
      .from('profiles')
      .select('id, role')
      .in('id', ids);
    if (pErr) {
      console.error('[notifications] profile lookup error:', pErr.message);
      return;
    }

    const rows: InsertInput[] = ((profileRows ?? []) as Array<{ id: string; role: string }>)
      .map((p) => {
        const roleSegment = p.role === 'teacher' ? 'teacher' : 'student';
        return {
          userId: p.id,
          type: 'announcement_comment' as NotificationType,
          refId: params.announcementId,
          title: `${params.commenterName} commented in ${params.className}`,
          body: params.commentPreview,
          linkPath: `/${roleSegment}/classes/${params.classId}?tab=stream`,
        };
      });
    await bulkInsertNotifications(rows);
  } catch (e) {
    console.error('[notifications] notifyAnnouncementComment failed:', e);
  }
}

// ----- (b) Student submitted → class teacher -----
export async function notifySubmissionCreated(params: {
  submissionId: string;
  activityId: string;
  activityTitle: string;
  classId: string;
  className: string;
  teacherId: string;
  studentName: string;
}): Promise<void> {
  try {
    await bulkInsertNotifications([
      {
        userId: params.teacherId,
        type: 'submission_new',
        refId: params.submissionId,
        title: `${params.studentName} submitted ${params.activityTitle}`,
        body: `In ${params.className}`,
        linkPath: `/teacher/classes/${params.classId}/activities/${params.activityId}/submissions/${params.submissionId}`,
      },
    ]);
  } catch (e) {
    console.error('[notifications] notifySubmissionCreated failed:', e);
  }
}

// ----- (c) Grade released — single submission -----
export async function notifyGradeReleased(params: {
  submissionId: string;
  activityId: string;
  activityTitle: string;
  classId: string;
  className: string;
  studentId: string;
}): Promise<void> {
  try {
    await bulkInsertNotifications([
      {
        userId: params.studentId,
        type: 'grade_released',
        refId: params.submissionId,
        title: `Grade released: ${params.activityTitle}`,
        body: `In ${params.className}`,
        linkPath: `/student/classes/${params.classId}/activities/${params.activityId}`,
      },
    ]);
  } catch (e) {
    console.error('[notifications] notifyGradeReleased failed:', e);
  }
}

// ----- (c, continued) Grade released — bulk via returnAllGrades -----
//
// Called after returnAllGrades. Pre-computes recipients by looking up the
// activity's submissions and notifies each one whose grade is released.
export async function notifyGradesReleasedBulk(params: {
  activityId: string;
  activityTitle: string;
  classId: string;
  className: string;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: subs, error } = await supabase
      .from('activity_submissions')
      .select('id, student_id, activity_grades!inner(returned_at)')
      .eq('activity_id', params.activityId)
      .not('activity_grades.returned_at', 'is', null);
    if (error) {
      console.error('[notifications] bulk grades lookup error:', error.message);
      return;
    }
    type SubRow = { id: string; student_id: string };
    const rows: InsertInput[] = ((subs ?? []) as SubRow[]).map((s) => ({
      userId: s.student_id,
      type: 'grade_released' as NotificationType,
      refId: s.id,
      title: `Grade released: ${params.activityTitle}`,
      body: `In ${params.className}`,
      linkPath: `/student/classes/${params.classId}/activities/${params.activityId}`,
    }));
    await bulkInsertNotifications(rows);
  } catch (e) {
    console.error('[notifications] notifyGradesReleasedBulk failed:', e);
  }
}

// ----- (d) Join request created → teacher of the class -----
export async function notifyJoinRequestCreated(params: {
  requestId: string;
  classId: string;
  className: string;
  teacherId: string;
  studentName: string;
}): Promise<void> {
  try {
    await bulkInsertNotifications([
      {
        userId: params.teacherId,
        type: 'join_request_new',
        refId: params.requestId,
        title: `${params.studentName} wants to join ${params.className}`,
        body: null,
        linkPath: `/teacher/classes/${params.classId}?tab=students`,
      },
    ]);
  } catch (e) {
    console.error('[notifications] notifyJoinRequestCreated failed:', e);
  }
}

// ----- (e) Join request decided → student -----
export async function notifyJoinRequestDecided(params: {
  requestId: string;
  classId: string;
  className: string;
  studentId: string;
  decision: 'approved' | 'rejected';
}): Promise<void> {
  try {
    const title =
      params.decision === 'approved'
        ? `You're now enrolled in ${params.className}`
        : `Your request to join ${params.className} was declined`;
    const linkPath =
      params.decision === 'approved'
        ? `/student/classes/${params.classId}`
        : '/student/classes';
    await bulkInsertNotifications([
      {
        userId: params.studentId,
        type: 'join_request_decided',
        refId: params.requestId,
        title,
        body: null,
        linkPath,
      },
    ]);
  } catch (e) {
    console.error('[notifications] notifyJoinRequestDecided failed:', e);
  }
}

// ----- (g) Module created → enrolled students -----
//
// Modules are visible to enrolled students immediately on creation (no
// "publish" toggle exists on class_modules). So we fan out on insert.
export async function notifyModuleCreated(params: {
  moduleId: string;
  classId: string;
  className: string;
  moduleTitle: string;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: enrollments, error } = await supabase
      .from('class_enrollments')
      .select('student_id')
      .eq('class_id', params.classId);
    if (error) {
      console.error('[notifications] module enrollments error:', error.message);
      return;
    }
    const rows: InsertInput[] = ((enrollments ?? []) as Array<{ student_id: string }>).map(
      (r) => ({
        userId: r.student_id,
        type: 'module_new',
        refId: params.moduleId,
        title: `New module in ${params.className}`,
        body: params.moduleTitle,
        linkPath: `/student/classes/${params.classId}/modules/${params.moduleId}`,
      }),
    );
    await bulkInsertNotifications(rows);
  } catch (e) {
    console.error('[notifications] notifyModuleCreated failed:', e);
  }
}

// ----- (g, continued) Lesson published → enrolled students -----
//
// Lessons are only visible to students when published=true. Trigger on the
// published-toggle moment, NOT on lesson creation (drafts shouldn't notify).
export async function notifyLessonPublished(params: {
  lessonId: string;
  moduleId: string;
  classId: string;
  className: string;
  lessonTitle: string;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: enrollments, error } = await supabase
      .from('class_enrollments')
      .select('student_id')
      .eq('class_id', params.classId);
    if (error) {
      console.error('[notifications] lesson enrollments error:', error.message);
      return;
    }
    const rows: InsertInput[] = ((enrollments ?? []) as Array<{ student_id: string }>).map(
      (r) => ({
        userId: r.student_id,
        type: 'lesson_published',
        refId: params.lessonId,
        title: `New lesson in ${params.className}`,
        body: params.lessonTitle,
        linkPath: `/student/classes/${params.classId}/lessons/${params.lessonId}`,
      }),
    );
    await bulkInsertNotifications(rows);
  } catch (e) {
    console.error('[notifications] notifyLessonPublished failed:', e);
  }
}

// ----- (g, continued) Activity published → enrolled students -----
//
// Like lessons, activities only surface to students when published=true.
// Trigger on the published-toggle moment.
export async function notifyActivityPublished(params: {
  activityId: string;
  classId: string;
  className: string;
  activityTitle: string;
  activityKind: 'assignment' | 'quiz';
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: enrollments, error } = await supabase
      .from('class_enrollments')
      .select('student_id')
      .eq('class_id', params.classId);
    if (error) {
      console.error('[notifications] activity enrollments error:', error.message);
      return;
    }
    const kindLabel = params.activityKind === 'quiz' ? 'quiz' : 'assignment';
    const rows: InsertInput[] = ((enrollments ?? []) as Array<{ student_id: string }>).map(
      (r) => ({
        userId: r.student_id,
        type: 'activity_published',
        refId: params.activityId,
        title: `New ${kindLabel} in ${params.className}`,
        body: params.activityTitle,
        linkPath: `/student/classes/${params.classId}/activities/${params.activityId}`,
      }),
    );
    await bulkInsertNotifications(rows);
  } catch (e) {
    console.error('[notifications] notifyActivityPublished failed:', e);
  }
}
