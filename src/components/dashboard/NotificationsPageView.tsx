'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'nextjs-toploader/app';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { stripMarkdown } from '@/lib/utils/stripMarkdown';
import {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/actions/notifications';
import { NOTIFICATION_DISPLAY, type NotificationRow } from '@/lib/types/notifications';

type Tab = 'all' | 'unread';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function dayGroup(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return 'Earlier';
}

export default function NotificationsPageView({
  initial,
}: {
  initial: { items: NotificationRow[]; hasMore: boolean };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('all');
  const [items, setItems] = useState<NotificationRow[]>(initial.items);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, setLoading] = useState(false);
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    if (tab === 'all') {
      setItems(initial.items);
      setHasMore(initial.hasMore);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  async function switchTab(next: Tab) {
    setTab(next);
    setLoading(true);
    const res = await listMyNotifications({ unreadOnly: next === 'unread', limit: 30 });
    setItems(res.items);
    setHasMore(res.hasMore);
    setLoading(false);
  }

  async function loadMore() {
    const last = items[items.length - 1];
    if (!last) return;
    setLoading(true);
    const res = await listMyNotifications({
      unreadOnly: tab === 'unread',
      before: last.createdAt,
      limit: 30,
    });
    setItems((prev) => [...prev, ...res.items]);
    setHasMore(res.hasMore);
    setLoading(false);
  }

  function open(n: NotificationRow) {
    if (!n.readAt) {
      setItems((prev) =>
        tab === 'unread'
          ? prev.filter((x) => x.id !== n.id)
          : prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
      );
      void markNotificationRead(n.id).catch(() => {});
    }
    router.push(n.linkPath);
  }

  function markAll() {
    const now = new Date().toISOString();
    setItems((prev) => (tab === 'unread' ? [] : prev.map((x) => (x.readAt ? x : { ...x, readAt: now }))));
    setHasMore(tab === 'unread' ? false : hasMore);
    startTransition(async () => {
      await markAllNotificationsRead().catch(() => {});
      router.refresh();
    });
  }

  const unreadVisible = items.some((n) => !n.readAt);
  let lastGroup = '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-zinc-900">Notifications</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Everything that happened in your classes.</p>
        </div>
        {unreadVisible && (
          <button
            type="button"
            onClick={markAll}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            Mark all read
          </button>
        )}
      </div>

      <div className="inline-flex gap-1 rounded-2xl bg-zinc-100 p-1">
        {(['all', 'unread'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => switchTab(t)}
            className={`inline-flex min-h-9 items-center rounded-xl px-4 text-sm transition ${
              tab === t
                ? 'bg-white font-bold text-red-700 shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                : 'font-semibold text-zinc-500 hover:text-zinc-900'
            }`}
          >
            {t === 'all' ? 'All' : 'Unread'}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="py-14 text-center">
            <Bell className="mx-auto mb-2 h-7 w-7 text-zinc-300" />
            <p className="text-sm font-semibold text-zinc-700">
              {tab === 'unread' ? "You're all caught up" : 'No notifications yet'}
            </p>
          </div>
        ) : (
          <ul>
            {items.map((n) => {
              const meta = NOTIFICATION_DISPLAY[n.type] ?? NOTIFICATION_DISPLAY.announcement_new;
              const Icon = meta.icon;
              const unread = !n.readAt;
              const group = dayGroup(n.createdAt);
              const showGroup = group !== lastGroup;
              lastGroup = group;
              return (
                <li key={n.id}>
                  {showGroup && (
                    <p className="border-t border-zinc-100 bg-zinc-50/60 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400 first:border-t-0">
                      {group}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => open(n)}
                    className={`flex w-full items-start gap-3 border-t border-zinc-100 px-4 py-3 text-left transition hover:bg-zinc-50 ${
                      unread ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.iconClassName}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${unread ? 'font-semibold text-zinc-900' : 'font-medium text-zinc-700'}`}>
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-zinc-600">{stripMarkdown(n.body)}</span>
                      )}
                      <span className="mt-1 block text-[11px] text-zinc-400">{formatWhen(n.createdAt)}</span>
                    </span>
                    {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {hasMore && items.length > 0 && (
          <div className="border-t border-zinc-100 p-3 text-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Load older
            </button>
          </div>
        )}
      </section>
    </div>
  );
}