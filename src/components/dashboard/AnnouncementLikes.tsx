'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ThumbsUp } from 'lucide-react';
import Modal from '@/components/shared/Modal';
import {
  type AnnouncementLike,
  setAnnouncementLiked,
} from '@/lib/actions/announcements';

interface AnnouncementLikesProps {
  announcementId: string;
  likes: AnnouncementLike[];
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

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AnnouncementLikes({
  announcementId,
  likes,
  currentUserId,
  isTeacher,
}: AnnouncementLikesProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showList, setShowList] = useState(false);

  const likedByMe = likes.some((l) => l.user_id === currentUserId);
  const [optimistic, setOptimistic] = useOptimistic(
    { liked: likedByMe, count: likes.length },
    (state, liked: boolean) => ({
      liked,
      count: Math.max(0, state.count + (liked ? 1 : -1)),
    }),
  );

  function toggleLike() {
    const next = !optimistic.liked;
    startTransition(async () => {
      setOptimistic(next);
      try {
        await setAnnouncementLiked(announcementId, next);
        router.refresh();
      } catch (e) {
        console.error(e);
      }
    });
  }

  const count = optimistic.count;
  const sorted = [...likes].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <div className="px-4 pb-3 pl-[3.75rem]">
      <div className="flex items-center gap-3">
        {!isTeacher && (
          <button
            type="button"
            onClick={toggleLike}
            disabled={isPending}
            aria-pressed={optimistic.liked}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition disabled:opacity-60 ${
              optimistic.liked
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <ThumbsUp
              className="h-3.5 w-3.5"
              fill={optimistic.liked ? 'currentColor' : 'none'}
            />
            Like
            {count > 0 && <span className="tabular-nums">· {count}</span>}
          </button>
        )}

        {isTeacher &&
          (count === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
              <ThumbsUp className="h-3.5 w-3.5" />
              No likes yet
            </span>
          ) : (
                        <button
              type="button"
              onClick={() => setShowList(true)}
              aria-haspopup="dialog"
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              <ThumbsUp className="h-3.5 w-3.5 text-red-600" fill="currentColor" />
              {count} {count === 1 ? 'like' : 'likes'}
              <span className="text-zinc-400">· See who</span>
            </button>
          ))}
      </div>

            {isTeacher && (
        <Modal
          open={showList}
          title={
            <span className="inline-flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-red-600" fill="currentColor" />
              Liked by {count} {count === 1 ? 'student' : 'students'}
            </span>
          }
          onClose={() => setShowList(false)}
          size="max-w-md"
        >
          {sorted.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">No likes yet.</p>
          ) : (
            <ul className="-mx-2 max-h-[60vh] divide-y divide-zinc-100 overflow-y-auto">
              {sorted.map((l) => (
                <li key={l.user_id} className="flex items-center gap-3 px-2 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-semibold text-red-700">
                    {initials(l.full_name)}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">
                    {l.full_name ?? 'Unknown'}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-400">{formatWhen(l.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}