// src/components/dashboard/AnnouncementsWidget.tsx
//
// Cross-class announcements widget for the dashboard.
//
// Renders the latest N announcements (pinned-first, then newest)
// across all the user's classes. Each row clicks through to the class
// detail page. Cap N = 5 (enforced upstream by the action's `limit`).

'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Megaphone, Pin } from 'lucide-react';
import type { RecentAnnouncementItem } from '@/lib/types/dashboard';

interface AnnouncementsWidgetProps {
  items: RecentAnnouncementItem[];
  // The base path each row links to — the row appends /{classId} to it.
  classesBasePath: '/student/classes' | '/teacher/classes';
}

// "2h ago" / "3d ago" formatter, with "just now" for sub-minute.
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

// Trim the body to a one-line preview. Strips newlines + common markdown
// glyphs so a markdown-formatted announcement still reads OK in a single
// line of preview text.
function previewBody(body: string, maxChars = 110): string {
  const flat = body
    .replace(/\r\n|\n|\r/g, ' ')
    .replace(/[*_#>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= maxChars) return flat;
  return flat.slice(0, maxChars - 1).trimEnd() + '…';
}

export default function AnnouncementsWidget({
  items,
  classesBasePath,
}: AnnouncementsWidgetProps) {
  const rows = useMemo(() => items, [items]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Megaphone className="h-4 w-4 text-slate-500" />
          Announcements
        </h2>
        {rows.length > 0 && (
          <span className="text-xs text-slate-500">
            {rows.length} recent
          </span>
        )}
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
          <div className="text-2xl">📭</div>
          <p className="mt-1 text-sm font-medium text-slate-700">
            No announcements yet.
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            New posts from your classes will appear here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((item) => (
            <li key={item.id}>
              <Link
                href={`${classesBasePath}/${item.classId}`}
                className="group block rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition hover:border-red-300 hover:bg-red-50/40"
              >
                <div className="flex items-start gap-2">
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.classColor }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {item.pinned && (
                        <Pin
                          className="h-3 w-3 shrink-0 text-amber-500"
                          aria-label="Pinned"
                        />
                      )}
                      <span className="truncate text-xs font-semibold text-slate-700 group-hover:text-red-700">
                        {item.className}
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        · {formatRelativeAge(item.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                      {previewBody(item.body)}
                    </p>
                    {item.authorName && (
                      <p className="mt-0.5 truncate text-[11px] text-slate-400">
                        — {item.authorName}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}