'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Clock,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PersonAvatar } from '@/components/dashboard/ProfileCard';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import { cn } from '@/lib/utils/cn';
import {
  sendMessage,
  markConversationRead,
  respondToRequest,
  editMessage,
  deleteMessage,
  deleteConversation,
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

/** Adds new messages, replaces edited/deleted ones, drops matching optimistic ones. */
function mergeMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const list = [...prev];
  for (const m of incoming) {
    const idx = list.findIndex((x) => x.id === m.id);
    if (idx >= 0) {
      list[idx] = m;
      continue;
    }
    const tempIdx = list.findIndex((x) => x.id.startsWith('temp-') && x.senderId === m.senderId && x.body === m.body);
    if (tempIdx >= 0) list.splice(tempIdx, 1);
    list.push(m);
  }
  return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function rowToMessage(r: {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
}): ChatMessage {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    body: r.body,
    createdAt: r.created_at,
    editedAt: r.edited_at ?? null,
    deletedAt: r.deleted_at ?? null,
  };
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

  const requests = filtered.filter((c) => c.isRequest);
  const chats = filtered.filter((c) => !c.isRequest);

  // New messages / accepted requests → refresh inbox + badge
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
    const channel = supabase
      .channel('messages-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, bump)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  function renderItem(c: ConversationListItem) {
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
              {c.status === 'pending' && c.requestedByMe ? (
                <span className="shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">
                  Pending
                </span>
              ) : unread ? (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                  {c.unreadCount > 99 ? '99+' : c.unreadCount}
                </span>
              ) : null}
            </span>
          </span>
        </Link>
      </li>
    );
  }

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
            <div className="p-2">
              {requests.length > 0 && (
                <>
                  <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-red-600">
                    Requests ({requests.length})
                  </p>
                  <ul className="mb-2 rounded-xl bg-red-50/40">{requests.map(renderItem)}</ul>
                </>
              )}
              {chats.length > 0 && (
                <>
                  {requests.length > 0 && (
                    <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                      Chats
                    </p>
                  )}
                  <ul>{chats.map(renderItem)}</ul>
                </>
              )}
            </div>
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
  const router = useRouter();
  const { conversationId, meId, other, status, requestedByMe } = thread;
  const [messages, setMessages] = useState<ChatMessage[]>(thread.messages);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [responding, setResponding] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [confirmDeleteConv, setConfirmDeleteConv] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isIncomingRequest = status === 'pending' && !requestedByMe;
  const iSentAlready = messages.some((m) => m.senderId === meId);
  const waitingForAccept = status === 'pending' && requestedByMe && iSentAlready;
  const canCompose = status === 'accepted' || (status === 'pending' && requestedByMe && !iSentAlready);

    useEffect(() => {
    setError(null);
  }, [status]);
  // Merge in server refreshes
  useEffect(() => {
    setMessages((prev) => mergeMessages(prev, thread.messages));
  }, [thread.messages]);

  // Keep scrolled to the newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // Close menus on outside click
  useEffect(() => {
    if (!menuFor && !headerMenu) return;
    function close() {
      setMenuFor(null);
      setHeaderMenu(false);
    }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuFor, headerMenu]);

  // Live updates: new, edited and deleted messages; request accepted
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`thread-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = rowToMessage(payload.new as Parameters<typeof rowToMessage>[0]);
          setMessages((prev) => mergeMessages(prev, [m]));
          if (m.senderId !== meId) void markConversationRead(conversationId);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = rowToMessage(payload.new as Parameters<typeof rowToMessage>[0]);
          setMessages((prev) => mergeMessages(prev, [m]));
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${conversationId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, meId, router]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || sending || !canCompose) return;
    setSending(true);
    setError(null);

    const temp: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversationId,
      senderId: meId,
      body,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
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

  async function handleRespond(accept: boolean) {
    setResponding(accept ? 'accept' : 'decline');
    setError(null);
    const res = await respondToRequest(conversationId, accept);
    setResponding(null);
        if (!res.ok) {
      // Already accepted some other way: just refresh into the normal chat
      if (/no request/i.test(res.error)) {
        router.refresh();
        return;
      }
      setError(res.error);
      return;
    }
    if (accept) router.refresh();
    else {
      router.push(basePath);
      router.refresh();
    }
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    const text = editText.trim();
    if (!text) return;
    setSavingEdit(true);
    setError(null);
    const res = await editMessage(editingId, text);
    setSavingEdit(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === editingId ? { ...m, body: text, editedAt: new Date().toISOString() } : m)),
    );
    setEditingId(null);
  }

  async function handleDeleteMessage() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    const res = await deleteMessage(id);
    if (!res.ok) throw new Error(res.error);
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, body: '[deleted]', deletedAt: new Date().toISOString() } : m)),
    );
  }

  async function handleDeleteConversation() {
    const res = await deleteConversation(conversationId);
    if (!res.ok) throw new Error(res.error);
    router.push(basePath);
    router.refresh();
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
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-zinc-900">{other.name}</p>
          <p className="truncate text-xs text-zinc-500">
            {other.username ? `@${other.username} · ` : ''}
            {roleLabel(other.role)}
          </p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setHeaderMenu((v) => !v);
              setMenuFor(null);
            }}
            aria-label="Conversation options"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-zinc-100"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {headerMenu && (
            <div
              role="menu"
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-11 z-20 w-52 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setHeaderMenu(false);
                  setConfirmDeleteConv(true);
                }}
                className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete conversation
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-[#faf8f7] px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <PersonAvatar id={other.id} name={other.name} url={other.avatarUrl} size={64} />
            <p className="text-sm font-bold text-zinc-900">Start a conversation with {other.name}</p>
            <p className="text-xs text-zinc-500">
              {status === 'pending' && requestedByMe
                ? `Your first message will be sent as a request. ${other.name} needs to accept it before you can chat.`
                : 'Messages are private between the two of you.'}
            </p>
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
              const deleted = !!m.deletedAt;
              const canManage = mine && !deleted && !pending;
              const isEditing = editingId === m.id;

              return (
                <li key={m.id}>
                  {newDay && (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-zinc-500 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                        {formatDayLabel(m.createdAt)}
                      </span>
                    </div>
                  )}
                  <div className={cn('group flex items-center gap-1', mine ? 'justify-end' : 'justify-start')}>
                    {/* Message menu (mine only) */}
                    {canManage && !isEditing && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuFor((v) => (v === m.id ? null : m.id));
                            setHeaderMenu(false);
                          }}
                          aria-label="Message options"
                          className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700',
                            menuFor === m.id ? 'opacity-100' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100',
                          )}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {menuFor === m.id && (
                          <div
                            role="menu"
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-8 z-20 w-36 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuFor(null);
                                setEditingId(m.id);
                                setEditText(m.body);
                              }}
                              className="flex min-h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuFor(null);
                                setConfirmDeleteId(m.id);
                              }}
                              className="flex min-h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {isEditing ? (
                      <div className="w-full max-w-[78%] rounded-2xl border border-zinc-300 bg-white p-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              void handleSaveEdit();
                            }
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          rows={2}
                          maxLength={2000}
                          autoFocus
                          className="w-full resize-none rounded-lg px-2 py-1 text-sm focus:outline-none"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                          >
                            <X className="h-3 w-3" />
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSaveEdit()}
                            disabled={savingEdit || !editText.trim()}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                          >
                            {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          'max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                          deleted
                            ? 'border border-dashed border-zinc-300 bg-transparent italic text-zinc-400'
                            : mine
                              ? 'rounded-br-md bg-zinc-900 text-white'
                              : 'rounded-bl-md bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.05)]',
                          pending && 'opacity-60',
                        )}
                      >
                        {deleted ? 'This message was deleted' : m.body}
                      </div>
                    )}
                  </div>
                  {lastInGroup && (
                    <p className={cn('mb-2 mt-1 text-[10px] text-zinc-400', mine ? 'text-right' : 'text-left')}>
                      {pending
                        ? 'Sending…'
                        : new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      {m.editedAt && !deleted && ' · edited'}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer: request banner / waiting / composer */}
      <div className="border-t border-zinc-100 p-3">
        {error && <p className="mb-2 px-1 text-xs font-semibold text-red-700">{error}</p>}

        {isIncomingRequest ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-sm font-semibold text-zinc-900">{other.name} wants to send you a message.</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              They can&apos;t send more until you accept. If you decline, the conversation is hidden.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void handleRespond(false)}
                disabled={responding !== null}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              >
                {responding === 'decline' && <Loader2 className="h-4 w-4 animate-spin" />}
                Decline
              </button>
              <button
                type="button"
                onClick={() => void handleRespond(true)}
                disabled={responding !== null}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {responding === 'accept' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Accept
              </button>
            </div>
          </div>
        ) : waitingForAccept ? (
          <div className="flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-3 text-sm text-zinc-600">
            <Clock className="h-4 w-4 shrink-0 text-zinc-400" />
            Request sent. You can keep chatting once {other.name} accepts.
          </div>
        ) : (
          <>
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
                  disabled={!canCompose}
                  placeholder={
                    status === 'pending' && requestedByMe
                      ? `Send a message request to ${other.name}`
                      : `Message ${other.name}`
                  }
                  className="max-h-32 min-h-11 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-4 focus:ring-zinc-900/5 disabled:bg-zinc-50"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!draft.trim() || sending || !canCompose}
                aria-label="Send message"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-zinc-400">Enter to send · Shift + Enter for a new line</p>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete message?"
        message="It will show as “This message was deleted” for both of you."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteMessage}
        onClose={() => setConfirmDeleteId(null)}
      />

      <ConfirmDialog
        open={confirmDeleteConv}
        title="Delete conversation?"
        message={`This removes the conversation for you only. ${other.name} still keeps their copy. If they message you again, it will come back with only the new messages.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConversation}
        onClose={() => setConfirmDeleteConv(false)}
      />
    </>
  );
}