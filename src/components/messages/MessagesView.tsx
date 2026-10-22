'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MessageCircle, Search, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PersonAvatar } from '@/components/dashboard/ProfileCard';
import { cn } from '@/lib/utils/cn';
import {
  sendMessage,
  markConversationRead,
  type ChatMessage,
  type ConversationListItem,
  type Thread,
} from '@/lib/actions/messages';

interface Props {
  basePath: string; // e.g. "/teacher/messages"
  conversations: ConversationListItem[];
  thread: Thread | null;
}

// ---------- helpers ----------
function formatListTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const diffDays = (now.getTime() - d.getTime()) / 86_400_000;
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function mergeMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const list = [...prev];
  for (const m of incoming) {
    if (list.some((x) => x.id === m.id)) continue;
    // Replace the matching optimistic message, if any
    const tempIdx = list.findIndex((x) => x.id.startsWith('temp-') && x.senderId === m.senderId && x.body === m.body);
    if (tempIdx >= 0) list.splice(tempIdx, 1);
    list.push(m);
  }
  return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function roleLabel(role: string) {
  return role === 'teacher' ? 'Teacher' : role === 'admin' ? 'Admin' : 'Student';
}

// ---------- main view ----------
export default function MessagesView({ basePath, conversations, thread }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const activeId = thread?.conversationId ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) => c.otherName.toLowerCase().includes(q) || (c.otherUsername ?? '').toLowerCase().includes(q),
    );
  }, [conversations, query]);

  // Any new message I can see (RLS limits this to my conversations) → refresh inbox + badge
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel('messages-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 400);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.5rem)] min-h-[480px] max-w-6xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {/* Conversation list */}
      <aside className={cn('w-full flex-col border-r border-zinc-100 md:flex md:w-80 md:shrink-0', activeId ? 'hidden' : 'flex')}>
        <div className="space-y-3 border-b border-zinc-100 p-4">
          <h1 className="text-lg font-extrabold text-zinc-900">Messages</h1>
          <label className="relative block">
            <span className="sr-only">Search conversations</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-4 focus:ring-zinc-900/5"
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <MessageCircle className="h-8 w-8 text-zinc-300" />
              <p className="text-sm font-semibold text-zinc-700">
                {conversations.length === 0 ? 'No messages yet' : 'No matches'}
              </p>
              {conversations.length === 0 && (
                <p className="text-xs text-zinc-500">
                  Open a class&apos;s People tab and click someone to send them a message.
                </p>
              )}
            </div>
          ) : (
            <ul className="p-2">
              {filtered.map((c) => {
                const active = c.conversationId === activeId;
                const unread = c.unreadCount > 0 && !active;
                return (
                  <li key={c.conversationId}>
                    <Link
                      href={`${basePath}?c=${c.conversationId}`}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 transition',
                        active ? 'bg-zinc-100' : 'hover:bg-zinc-50',
                      )}
                    >
                      <PersonAvatar id={c.otherUserId} name={c.otherName} url={c.otherAvatarUrl} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn('truncate text-sm', unread ? 'font-extrabold text-zinc-900' : 'font-semibold text-zinc-800')}>
                            {c.otherName}
                          </span>
                          <span className="shrink-0 text-[11px] text-zinc-400">{formatListTime(c.lastMessageAt)}</span>
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn('truncate text-xs', unread ? 'font-semibold text-zinc-700' : 'text-zinc-500')}>
                            {c.lastMessagePreview ?? 'Say hi 👋'}
                          </span>
                          {unread && (
                            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                              {c.unreadCount > 99 ? '99+' : c.unreadCount}
                            </span>
                          )}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Thread */}
      <section className={cn('min-w-0 flex-1 flex-col md:flex', activeId ? 'flex' : 'hidden')}>
        {thread ? (
          <ThreadPane key={thread.conversationId} thread={thread} basePath={basePath} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100">
              <MessageCircle className="h-6 w-6 text-zinc-500" />
            </span>
            <p className="text-sm font-bold text-zinc-900">Select a conversation</p>
            <p className="text-xs text-zinc-500">Choose someone on the left to see your messages.</p>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- thread pane ----------
function ThreadPane({ thread, basePath }: { thread: Thread; basePath: string }) {
  const { conversationId, meId, other } = thread;
  const [messages, setMessages] = useState<ChatMessage[]>(thread.messages);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Merge in server refreshes
  useEffect(() => {
    setMessages((prev) => mergeMessages(prev, thread.messages));
  }, [thread.messages]);

  // Keep scrolled to the newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // Live updates for this conversation
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`thread-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const r = payload.new as { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };
          setMessages((prev) =>
            mergeMessages(prev, [
              { id: r.id, conversationId: r.conversation_id, senderId: r.sender_id, body: r.body, createdAt: r.created_at },
            ]),
          );
          if (r.sender_id !== meId) void markConversationRead(conversationId);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, meId]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);

    const temp: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversationId,
      senderId: meId,
      body,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, temp]);
    setDraft('');

    const res = await sendMessage(conversationId, body);
    if (res.ok) {
      setMessages((prev) => mergeMessages(prev, [res.message]));
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
      setDraft(body);
      setError(res.error);
    }
    setSending(false);
    inputRef.current?.focus();
  }

  return (
    <>
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3">
        <Link
          href={basePath}
          aria-label="Back to conversations"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 md:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <PersonAvatar id={other.id} name={other.name} url={other.avatarUrl} size={40} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-zinc-900">{other.name}</p>
          <p className="truncate text-xs text-zinc-500">
            {other.username ? `@${other.username} · ` : ''}
            {roleLabel(other.role)}
          </p>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-[#faf8f7] px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <PersonAvatar id={other.id} name={other.name} url={other.avatarUrl} size={64} />
            <p className="text-sm font-bold text-zinc-900">Start a conversation with {other.name}</p>
            <p className="text-xs text-zinc-500">Messages are private between the two of you.</p>
          </div>
        ) : (
          <ol className="space-y-1">
            {messages.map((m, i) => {
              const mine = m.senderId === meId;
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
              const lastInGroup =
                !next ||
                next.senderId !== m.senderId ||
                new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime() > 5 * 60_000;
              const pending = m.id.startsWith('temp-');

              return (
                <li key={m.id}>
                  {newDay && (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-zinc-500 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                        {formatDayLabel(m.createdAt)}
                      </span>
                    </div>
                  )}
                  <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                        mine ? 'rounded-br-md bg-zinc-900 text-white' : 'rounded-bl-md bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.05)]',
                        pending && 'opacity-60',
                      )}
                    >
                      {m.body}
                    </div>
                  </div>
                  {lastInGroup && (
                    <p className={cn('mb-2 mt-1 text-[10px] text-zinc-400', mine ? 'text-right' : 'text-left')}>
                      {pending ? 'Sending…' : new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-zinc-100 p-3">
        {error && <p className="mb-2 px-1 text-xs font-semibold text-red-700">{error}</p>}
        <div className="flex items-end gap-2">
          <label className="flex-1">
            <span className="sr-only">Message</span>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder={`Message ${other.name}`}
              className="max-h-32 min-h-11 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-4 focus:ring-zinc-900/5"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!draft.trim() || sending}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-zinc-400">Enter to send · Shift + Enter for a new line</p>
      </div>
    </>
  );
}