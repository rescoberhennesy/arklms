'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pin, PinOff, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import {
  type Announcement,
  type AnnouncementComment,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  setAnnouncementPinned,
  createComment,
  deleteComment,
} from '@/lib/actions/announcements';
import { markAiGenerationPublished } from '@/lib/actions/aiGenerations';
import MarkdownContent from './MarkdownContent';
import MarkdownEditor from './MarkdownEditor';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import { Sparkles } from 'lucide-react';
import AIDraftPanel from '@/components/teacher/ai/AIDraftPanel';


interface StreamViewProps {
  classId: string;
  announcements: Announcement[];
  currentUserId: string;
  isTeacher: boolean;
}

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function wasEdited(createdIso: string, updatedIso: string): boolean {
  // 30-second grace window to ignore trivial trigger fires.
  return new Date(updatedIso).getTime() - new Date(createdIso).getTime() > 30_000;
}

function Avatar({ name }: { name: string | null | undefined }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-semibold text-red-700">
      {initials(name)}
    </div>
  );
}

export default function StreamView({
  classId,
  announcements,
  currentUserId,
  isTeacher,
}: StreamViewProps) {
  return (
    <div className="space-y-4">
      {isTeacher && <Composer classId={classId} />}

      {announcements.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-gray-700">No announcements yet</p>
          {isTeacher && (
            <p className="mt-1 text-xs text-gray-500">
              Post one to get started.
            </p>
          )}
        </div>
      ) : (
        announcements.map((a) => (
          <AnnouncementCard
            key={a.id}
            announcement={a}
            currentUserId={currentUserId}
            isTeacher={isTeacher}
          />
        ))
      )}
    </div>
  );
}

function Composer({ classId }: { classId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState(false);
  const [pendingGenerationId, setPendingGenerationId] = useState<string | null>(null);

  function handleAiAccept(combinedBody: string, generationId: string | null) {
    setBody(combinedBody);
    setPendingGenerationId(generationId);
    setAiMode(false);
  }

  function handleSubmit() {
    if (!body.trim() || isPending) return;
    setError(null);
    const generationId = pendingGenerationId;
    startTransition(async () => {
      try {
        await createAnnouncement(classId, body);
        if (generationId) {
          // Best-effort: tag the generation as published with the final body.
          await markAiGenerationPublished(generationId, {
            title: '',
            body,
          });
        }
        setBody('');
        setPendingGenerationId(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to post.');
      }
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      {aiMode ? (
        <AIDraftPanel
          classId={classId}
          onAccept={handleAiAccept}
          onCancel={() => setAiMode(false)}
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">New announcement</span>
            <button
              type="button"
              onClick={() => setAiMode(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI Draft
            </button>
          </div>

          <MarkdownEditor
            value={body}
            onChange={setBody}
            placeholder="Share an announcement with your class..."
            disabled={isPending}
          />

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!body.trim() || isPending}
              className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {isPending ? 'Posting...' : 'Post'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface AnnouncementCardProps {
  announcement: Announcement;
  currentUserId: string;
  isTeacher: boolean;
}

function AnnouncementCard({
  announcement,
  currentUserId,
  isTeacher,
}: AnnouncementCardProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(announcement.body);
  const [editError, setEditError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const edited = wasEdited(announcement.created_at, announcement.updated_at);
  const authorName = announcement.author?.full_name ?? 'Unknown';

  function handleSaveEdit() {
    setEditError(null);
    const trimmed = editBody.trim();
    if (!trimmed) {
      setEditError('Body cannot be empty.');
      return;
    }
    startTransition(async () => {
      try {
        await updateAnnouncement(announcement.id, trimmed);
        setIsEditing(false);
        router.refresh();
      } catch (e) {
        setEditError(e instanceof Error ? e.message : 'Failed to save.');
      }
    });
  }

  function handleCancelEdit() {
    setEditBody(announcement.body);
    setEditError(null);
    setIsEditing(false);
  }

  function handleTogglePin() {
    startTransition(async () => {
      try {
        await setAnnouncementPinned(announcement.id, !announcement.pinned);
        router.refresh();
      } catch (e) {
        // Silent — pin is low-stakes; user can retry.
        console.error(e);
      }
    });
  }

  async function handleDelete() {
    // ConfirmDialog auto-closes on successful onConfirm.
    await deleteAnnouncement(announcement.id);
    router.refresh();
  }

  return (
    <article
      className={`rounded-xl border bg-white shadow-sm ${
        announcement.pinned
          ? 'border-l-4 border-l-amber-400 border-t-gray-200 border-r-gray-200 border-b-gray-200'
          : 'border-gray-200'
      }`}
    >
      <header className="flex items-start gap-3 px-4 pt-4">
        <Avatar name={authorName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-gray-900">
              {authorName}
            </span>
            {announcement.pinned && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                <Pin className="h-3 w-3" />
                Pinned
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500">
            {formatTimestamp(announcement.created_at)}
            {edited && <span className="ml-1.5 italic">(edited)</span>}
          </div>
        </div>

        {isTeacher && !isEditing && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleTogglePin}
              disabled={isPending}
              className="rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              aria-label={announcement.pinned ? 'Unpin' : 'Pin'}
              title={announcement.pinned ? 'Unpin' : 'Pin'}
            >
              {announcement.pinned ? (
                <PinOff className="h-4 w-4" />
              ) : (
                <Pin className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              disabled={isPending}
              className="rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              aria-label="Edit"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={isPending}
              className="rounded-md p-1.5 text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              aria-label="Delete"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </header>

      <div className="px-4 pb-3 pt-2 pl-[3.75rem]">
        {isEditing ? (
          <div>
            <MarkdownEditor
              value={editBody}
              onChange={setEditBody}
              placeholder="Edit announcement…"
              disabled={isPending}
            />
            {editError && (
              <p className="mt-2 text-xs text-red-600">{editError}</p>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={isPending}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isPending || !editBody.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        ) : (
          <MarkdownContent body={announcement.body} />
        )}
      </div>

      <CommentSection
        announcementId={announcement.id}
        comments={announcement.comments}
        currentUserId={currentUserId}
        isTeacher={isTeacher}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete announcement?"
        message="This will also delete all comments on it. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </article>
  );
}

interface CommentSectionProps {
  announcementId: string;
  comments: AnnouncementComment[];
  currentUserId: string;
  isTeacher: boolean;
}

function CommentSection({
  announcementId,
  comments,
  currentUserId,
  isTeacher,
}: CommentSectionProps) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePost() {
    setError(null);
    const trimmed = body.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        await createComment(announcementId, trimmed);
        setBody('');
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to post.');
      }
    });
  }

  function handleDelete(commentId: string) {
    startTransition(async () => {
      try {
        await deleteComment(commentId);
        router.refresh();
      } catch (e) {
        console.error(e);
      }
    });
  }

  return (
    <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
      {comments.length > 0 && (
        <ul className="mb-3 space-y-2">
          {comments.map((c) => {
            const canDelete = isTeacher || c.author?.id === currentUserId;
            const authorName = c.author?.full_name ?? 'Unknown';
            return (
              <li key={c.id} className="flex items-start gap-2">
                <Avatar name={authorName} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-900">
                      {authorName}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatTimestamp(c.created_at)}
                    </span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        disabled={isPending}
                        className="ml-auto rounded p-0.5 text-gray-400 transition hover:bg-gray-200 hover:text-red-600 disabled:opacity-50"
                        aria-label="Delete comment"
                        title="Delete comment"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <MarkdownContent body={c.body} className="mt-0.5" />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-start gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          rows={2}
          disabled={isPending}
          className="flex-1 resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handlePost}
          disabled={isPending || !body.trim()}
          className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Post
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}