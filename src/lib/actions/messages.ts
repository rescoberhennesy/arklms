'use server';

import { createClient } from '@/lib/supabase/server';

// ---------- Types ----------

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
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export type Thread = {
  conversationId: string;
  meId: string;
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
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

const MAX_LEN = 2000;

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
  };
}

function mapMessage(r: MessageRow): ChatMessage {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    body: r.body,
    createdAt: r.created_at,
  };
}

// ---------- Actions ----------

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
  if (!row) return null; // not a participant, or doesn't exist

  const { data: msgs, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(200);
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

export async function startConversation(
  otherUserId: string,
): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  try {
    const { supabase } = await requireAuth();
    const { data, error } = await supabase.rpc('start_direct_conversation', { p_other: otherUserId });
    if (error) return { ok: false, error: error.message };
    return { ok: true, conversationId: data as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not start the conversation.' };
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
      .select('id, conversation_id, sender_id, body, created_at')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, message: mapMessage(data as MessageRow) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not send the message.' };
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