'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { RecentAnnouncementItem } from '@/lib/types/dashboard';

export type AnnouncementAuthor = {
  id: string;
  full_name: string | null;
};

export type AnnouncementComment = {
  id: string;
  announcement_id: string;
  body: string;
  created_at: string;
  author: AnnouncementAuthor | null;
};

export type Announcement = {
  id: string;
  class_id: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  author: AnnouncementAuthor | null;
  comments: AnnouncementComment[];
};

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  return { supabase, userId: user.id };
}

export async function listAnnouncements(classId: string): Promise<Announcement[]> {
  const { supabase } = await requireAuth();

  const { data, error } = await supabase
    .from('class_announcements')
    .select(`
      id, class_id, body, pinned, created_at, updated_at,
      author:author_id ( id, full_name ),
      announcement_comments (
        id, announcement_id, body, created_at,
        author:author_id ( id, full_name )
      )
    `)
    .eq('class_id', classId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to list announcements: ${error.message}`);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    class_id: row.class_id,
    body: row.body,
    pinned: row.pinned,
    created_at: row.created_at,
    updated_at: row.updated_at,
    author: row.author
      ? { id: row.author.id, full_name: row.author.full_name }
      : null,
    comments: ((row.announcement_comments ?? []) as any[])
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((c: any) => ({
        id: c.id,
        announcement_id: c.announcement_id,
        body: c.body,
        created_at: c.created_at,
        author: c.author
          ? { id: c.author.id, full_name: c.author.full_name }
          : null,
      })),
  })) as Announcement[];
}

export async function createAnnouncement(
  classId: string,
  body: string,
): Promise<void> {
  const { supabase, userId } = await requireAuth();
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Announcement body cannot be empty.');

  const { error } = await supabase
    .from('class_announcements')
    .insert({
      class_id: classId,
      author_id: userId,
      body: trimmed,
    });

  if (error) throw new Error(`Failed to create announcement: ${error.message}`);
  revalidatePath(`/teacher/classes/${classId}`);
  revalidatePath(`/student/classes/${classId}`);
}

export async function updateAnnouncement(
  announcementId: string,
  body: string,
): Promise<void> {
  const { supabase } = await requireAuth();
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Announcement body cannot be empty.');

  const { data, error } = await supabase
    .from('class_announcements')
    .update({ body: trimmed })
    .eq('id', announcementId)
    .select('class_id')
    .single();

  if (error) throw new Error(`Failed to update announcement: ${error.message}`);
  if (data?.class_id) {
    revalidatePath(`/teacher/classes/${data.class_id}`);
    revalidatePath(`/student/classes/${data.class_id}`);
  }
}

export async function deleteAnnouncement(announcementId: string): Promise<void> {
  const { supabase } = await requireAuth();

  // Read class_id first so we can revalidate after delete.
  const { data: pre } = await supabase
    .from('class_announcements')
    .select('class_id')
    .eq('id', announcementId)
    .maybeSingle();

  const { error } = await supabase
    .from('class_announcements')
    .delete()
    .eq('id', announcementId);

  if (error) throw new Error(`Failed to delete announcement: ${error.message}`);
  if (pre?.class_id) {
    revalidatePath(`/teacher/classes/${pre.class_id}`);
    revalidatePath(`/student/classes/${pre.class_id}`);
  }
}

export async function setAnnouncementPinned(
  announcementId: string,
  pinned: boolean,
): Promise<void> {
  const { supabase } = await requireAuth();
  const { error } = await supabase.rpc('set_announcement_pinned', {
    p_id: announcementId,
    p_pinned: pinned,
  });
  if (error) throw new Error(`Failed to ${pinned ? 'pin' : 'unpin'}: ${error.message}`);

  // Revalidate the relevant class detail pages. We don't have class_id at the
  // call site, so look it up.
  const { data } = await supabase
    .from('class_announcements')
    .select('class_id')
    .eq('id', announcementId)
    .maybeSingle();
  if (data?.class_id) {
    revalidatePath(`/teacher/classes/${data.class_id}`);
    revalidatePath(`/student/classes/${data.class_id}`);
  }
}

export async function createComment(
  announcementId: string,
  body: string,
): Promise<void> {
  const { supabase, userId } = await requireAuth();
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Comment body cannot be empty.');

  const { error } = await supabase
    .from('announcement_comments')
    .insert({
      announcement_id: announcementId,
      author_id: userId,
      body: trimmed,
    });

  if (error) throw new Error(`Failed to post comment: ${error.message}`);

  // Revalidate parent class pages.
  const { data } = await supabase
    .from('class_announcements')
    .select('class_id')
    .eq('id', announcementId)
    .maybeSingle();
  if (data?.class_id) {
    revalidatePath(`/teacher/classes/${data.class_id}`);
    revalidatePath(`/student/classes/${data.class_id}`);
  }
}

export async function deleteComment(commentId: string): Promise<void> {
  const { supabase } = await requireAuth();

  // Look up parent class_id (via the announcement) for revalidation.
  const { data: pre } = await supabase
    .from('announcement_comments')
    .select(`announcement:announcement_id ( class_id )`)
    .eq('id', commentId)
    .maybeSingle();

  const { error } = await supabase
    .from('announcement_comments')
    .delete()
    .eq('id', commentId);

  if (error) throw new Error(`Failed to delete comment: ${error.message}`);

  const classId = (pre?.announcement as any)?.class_id as string | undefined;
  if (classId) {
    revalidatePath(`/teacher/classes/${classId}`);
    revalidatePath(`/student/classes/${classId}`);
  }
}

// ==========================================================================
// CROSS-CLASS DASHBOARD WIDGET
// ==========================================================================

// Returns the newest N announcements across ALL classes the current user
// has access to. RLS filters out classes they're not a member/teacher
// of automatically, so we don't pass classId or enforce ownership here.
// Pinned items still sort first; secondary sort is created_at desc.
export async function listRecentAnnouncementsAcrossClasses(
  limit: number = 5,
): Promise<RecentAnnouncementItem[]> {
  const { supabase } = await requireAuth();

  const { data, error } = await supabase
    .from('class_announcements')
    .select(`
      id, class_id, body, pinned, created_at,
      author:author_id ( full_name ),
      class:class_id ( name, color )
    `)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load recent announcements: ${error.message}`);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    classId: row.class_id,
    className: row.class?.name ?? 'Unknown class',
    classColor: row.class?.color ?? '#dc2626',
    body: row.body,
    pinned: row.pinned,
    createdAt: row.created_at,
    authorName: row.author?.full_name ?? null,
  }));
}