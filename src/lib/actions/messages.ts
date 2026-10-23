'use server';

import { createClient } from '@/lib/supabase/server';

// ---------- Types ----------

export type ConversationStatus = 'pending' | 'accepted' | 'declined';

export type ConversationListItem = {
  conversationId: string;
  otherUserId: string;
  otherName: string;
  otherUsername: string | null;
  otherAvatarUrl: string | null;
  otherRole: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
  status: ConversationStatus;
  requestedByMe: boolean;
  /** Someone else's request waiting for my Accept/Decline. */
  isRequest: boolean;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

export type Thread = {
  conversationId: string;
  meId: string;
  status: ConversationStatus;
  requestedByMe: boolean;
  other: {
    id: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
    role: string;
  };
  messages: ChatMessage[];
};

type ConvRow = {
  conversation_id: string;
  other_user_id: string;
  other_full_name: string | null;
  other_username: string | null;
  other_avatar_url: string | null;
  other_role: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number | null;
  status: string | null;
  requested_by_me: boolean | null;
  cleared_at: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

type Result = { ok: true } | { ok: false; error: string };

const MAX_LEN = 2000;
const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, body, created_at, edited_at, deleted_at';

// ---------- Helpers ----------

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  return { supabase, userId: user.id };
}

function mapConv(r: ConvRow): ConversationListItem {
  const status = (r.status ?? 'accepted') as ConversationStatus;
  const requestedByMe = r.requested_by_me ?? false;
  return {
    conversationId: r.conversation_id,
    otherUserId: r.other_user_id,
    otherName: r.other_full_name || r.other_username || 'Unknown user',
    otherUsername: r.other_username,
    otherAvatarUrl: r.other_avatar_url,
    otherRole: r.other_role ?? 'student',
    lastMessageAt: r.last_message_at,
    lastMessagePreview: r.last_message_preview,
    unreadCount: r.unread_count ?? 0,
    status,
    requestedByMe,
    isRequest: status === 'pending' && !requestedByMe,
  };
}

function mapMessage(r: MessageRow): ChatMessage {
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

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// ---------- Reads ----------

export async function listConversations(): Promise<ConversationListItem[]> {
  const { supabase } = await requireAuth();
  const { data, error } = await supabase.rpc('list_my_conversations');
  if (error) {
    console.error('[messages] list_my_conversations failed:', error.message);
    return [];
  }
  return ((data ?? []) as ConvRow[]).map(mapConv);
}

export async function getThread(conversationId: string): Promise<Thread | null> {
  const { supabase, userId } = await requireAuth();

  const { data: convs, error: convErr } = await supabase.rpc('list_my_conversations');
  if (convErr) {
    console.error('[messages] getThread conversations failed:', convErr.message);
    return null;
  }
  const row = ((convs ?? []) as ConvRow[]).find((r) => r.conversation_id === conversationId);
  if (!row) return null; // not a participant, cleared, declined, or doesn't exist

  let query = supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(200);
  // "Deleted conversation" = hide everything before I cleared it
  if (row.cleared_at) query = query.gt('created_at', row.cleared_at);

  const { data: msgs, error } = await query;
  if (error) console.error('[messages] load messages failed:', error.message);

  // Opening the thread marks it as read
  await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);

  const conv = mapConv(row);
  return {
    conversationId,
    meId: userId,
    status: conv.status,
    requestedByMe: conv.requestedByMe,
    other: {
      id: conv.otherUserId,
      name: conv.otherName,
      username: conv.otherUsername,
      avatarUrl: conv.otherAvatarUrl,
      role: conv.otherRole,
    },
    messages: ((msgs ?? []) as MessageRow[]).reverse().map(mapMessage),
  };
}

export async function getUnreadMessageCount(): Promise<number> {
  try {
    const { supabase } = await requireAuth();
    const { data, error } = await supabase.rpc('unread_message_count');
    if (error) return 0;
    return (data as number) ?? 0;
  } catch {
    return 0;
  }
}

// ---------- Writes ----------

export async function startConversation(
  otherUserId: string,
): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  try {
    const { supabase } = await requireAuth();
    const { data, error } = await supabase.rpc('start_direct_conversation', { p_other: otherUserId });
    if (error) return { ok: false, error: error.message };
    return { ok: true, conversationId: data as string };
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Could not start the conversation.') };
  }
}

export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<{ ok: true; message: ChatMessage } | { ok: false; error: string }> {
  const text = body.trim();
  if (!text) return { ok: false, error: 'Message is empty.' };
  if (text.length > MAX_LEN) return { ok: false, error: `Messages can be up to ${MAX_LEN} characters.` };

  try {
    const { supabase, userId } = await requireAuth();
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: userId, body: text })
      .select(MESSAGE_COLUMNS)
      .single();
    if (error) {
      // RLS blocks sending while a request is pending
      if (/row-level security/i.test(error.message)) {
        return { ok: false, error: 'You can send more messages once your request is accepted.' };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true, message: mapMessage(data as MessageRow) };
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Could not send the message.') };
  }
}

export async function respondToRequest(conversationId: string, accept: boolean): Promise<Result> {
  try {
    const { supabase } = await requireAuth();
    const { error } = await supabase.rpc('respond_to_message_request', {
      p_conversation_id: conversationId,
      p_accept: accept,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Could not respond to the request.') };
  }
}

export async function editMessage(messageId: string, body: string): Promise<Result> {
  const text = body.trim();
  if (!text) return { ok: false, error: 'Message is empty.' };
  if (text.length > MAX_LEN) return { ok: false, error: `Messages can be up to ${MAX_LEN} characters.` };
  try {
    const { supabase } = await requireAuth();
    const { error } = await supabase.rpc('edit_message', { p_message_id: messageId, p_body: text });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Could not edit the message.') };
  }
}

export async function deleteMessage(messageId: string): Promise<Result> {
  try {
    const { supabase } = await requireAuth();
    const { error } = await supabase.rpc('delete_message', { p_message_id: messageId });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Could not delete the message.') };
  }
}

export async function deleteConversation(conversationId: string): Promise<Result> {
  try {
    const { supabase } = await requireAuth();
    const { error } = await supabase.rpc('clear_conversation_for_me', {
      p_conversation_id: conversationId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Could not delete the conversation.') };
  }
}

export async function markConversationRead(conversationId: string): Promise<void> {
  try {
    const { supabase, userId } = await requireAuth();
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);
  } catch {
    /* best effort */
  }
}