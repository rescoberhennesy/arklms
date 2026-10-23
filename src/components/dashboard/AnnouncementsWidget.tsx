// src/components/dashboard/AnnouncementsWidget.tsx
//
// Cross-class announcements widget (latest N, pinned first). Each row
// links to the class page.

'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Pin } from 'lucide-react';
import { PersonAvatar } from '@/components/dashboard/ProfileCard';
import type { RecentAnnouncementItem } from '@/lib/types/dashboard';

interface AnnouncementsWidgetProps {
  items: RecentAnnouncementItem[];
  classesBasePath: '/student/classes' | '/teacher/classes';
}

function formatRelativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(ms / 3_600_000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(ms / 86_400_000);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

function previewBody(body: string, maxChars = 110): string {
  const flat = body
    .replace(/\r\n|\n|\r/g, ' ')
    .replace(/[*_#>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= maxChars) return flat;
  return flat.slice(0, maxChars - 1).trimEnd() + '…';
}

export default function AnnouncementsWidget({ items, classesBasePath }: AnnouncementsWidgetProps) {
  const rows = useMemo(() => items, [items]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-extrabold text-zinc-900">Announcements</h2>
        {rows.length > 0 && <span className="text-xs text-zinc-400">{rows.length} recent</span>}
      </header>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-zinc-700">No announcements yet.</p>
          <p className="mt-0.5 text-xs text-zinc-500">New posts from your classes will appear here.</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {rows.map((item) => (
            <li key={item.id}>
              <Link
                href={`${classesBasePath}/${item.classId}`}
                className="group flex items-start gap-3 rounded-xl p-2.5 transition hover:bg-zinc-50"
              >
                  <PersonAvatar
                  id={item.authorId ?? item.id}
                  name={item.authorName ?? 'Teacher'}
                  url={item.authorAvatarUrl}
                  size={36}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {item.pinned && <Pin className="h-3 w-3 shrink-0 text-zinc-500" aria-label="Pinned" />}
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.classColor }}
                      aria-hidden
                    />
                    <span className="truncate text-[13px] font-bold text-zinc-900 group-hover:text-red-700">
                      {item.className}
                    </span>
                    <span className="shrink-0 text-[11px] text-zinc-400">· {formatRelativeAge(item.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[13px] text-zinc-600">{previewBody(item.body)}</span>
                  {item.authorName && (
                    <span className="mt-0.5 block truncate text-[11px] text-zinc-400">{item.authorName}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}