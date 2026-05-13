'use client';

// src/components/dashboard/NotificationBellClient.tsx
//
// Client-side bell button + dropdown. Receives initial data from the
// server-component wrapper; refreshes via router.refresh() after mutations
// (mark-read, mark-all-read) which re-runs the server component and pushes
// fresh data down. No realtime subscription — fresh data flows in on next
// page navigation by design (see notifications carry-forward).

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import {
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/actions/notifications';
import {
  NOTIFICATION_DISPLAY,
  type NotificationDropdownData,
  type NotificationRow,
} from '@/lib/types/notifications';

interface Props {
  initialData: NotificationDropdownData;
}

// Lightweight relative-time formatter. Not internationalized — if the LMS
// adds locale support later, swap this for Intl.RelativeTimeFormat.
function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  // Older than a month → fall back to a simple date.
  return new Date(iso).toLocaleDateString();
}

export default function NotificationBellClient({ initialData }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>(initialData.items);
  const [unreadCount, setUnreadCount] = useState(initialData.unreadCount);
  const [busy, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync local state when server pushes fresh data (e.g. after
  // router.refresh()). Pattern mirrors useServerSyncedState but inline —
  // notifications are simple enough that the hook isn't worth importing.
  useEffect(() => {
    setItems(initialData.items);
    setUnreadCount(initialData.unreadCount);
  }, [initialData]);

  // Close dropdown on outside-click. The dropdown is anchored to the bell
  // button; click anywhere else (or hit Escape) and it goes away.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function handleItemClick(n: NotificationRow) {
    // Optimistic: mark read locally, then fire server mutation in the
    // background, then navigate. If the server call fails we don't
    // rollback — the visual lag of "still unread" is annoying and the
    // failure is rare.
    if (!n.readAt) {
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
        ),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      startTransition(async () => {
        try {
          await markNotificationRead(n.id);
        } catch (err) {
          console.error('[notifications] mark read failed:', err);
        }
        router.refresh();
      });
    }
    setOpen(false);
    router.push(n.linkPath);
  }

  function handleMarkAllRead() {
    if (unreadCount === 0) return;
    // Optimistic: mark every item read locally + zero the badge.
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((x) => (x.readAt ? x : { ...x, readAt: now })),
    );
    setUnreadCount(0);
    startTransition(async () => {
      try {
        await markAllNotificationsRead();
      } catch (err) {
        console.error('[notifications] mark all read failed:', err);
      }
      router.refresh();
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="bell-btn relative p-2 rounded-lg"
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : 'Notifications'
        }
        aria-expanded={open}
      >
        <Bell size={19} strokeWidth={2} className="bell-icon" />
        {unreadCount > 0 && (
          <span
            className="notification-badge absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-semibold ring-2 ring-white"
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] max-w-[90vw] rounded-lg border border-gray-200 bg-white shadow-xl ring-1 ring-black/5 z-50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <h3 className="text-sm font-semibold text-gray-900">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={busy}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCheck className="h-3 w-3" />
                )}
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              <Bell className="mx-auto mb-2 h-6 w-6 text-gray-300" />
              No notifications yet.
            </div>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto divide-y divide-gray-100">
              {items.map((n) => {
                const meta = NOTIFICATION_DISPLAY[n.type];
                const Icon = meta.icon;
                const isUnread = !n.readAt;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleItemClick(n)}
                      className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-gray-50 ${
                        isUnread ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.iconClassName}`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <p
                            className={`flex-1 truncate text-sm ${
                              isUnread
                                ? 'font-semibold text-gray-900'
                                : 'font-medium text-gray-700'
                            }`}
                          >
                            {n.title}
                          </p>
                          {isUnread && (
                            <span
                              className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600"
                              aria-label="Unread"
                            />
                          )}
                        </div>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-gray-400">
                          {formatRelative(n.createdAt)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
