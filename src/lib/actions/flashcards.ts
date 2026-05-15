// src/lib/actions/flashcards.ts
//
// Server actions for flashcard decks and individual cards.
//
// Pattern note: RLS handles authorization. Each call goes through createClient()
// which uses the user's Supabase session — non-owners get RLS rejections, not
// app-layer 403s. Mirrors the rest of the codebase.

'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlashcardRow {
  id: string;
  deckId: string;
  front: string;
  back: string;
  displayOrder: number;
  createdAt: string;
}

export interface FlashcardDeckRow {
  id: string;
  lessonId: string;
  title: string;
  published: boolean;
  createdBy: string;
  aiGenerationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FlashcardDeckView {
  deck: FlashcardDeckRow;
  cards: FlashcardRow[];
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

interface RawDeckRow {
  id: string;
  lesson_id: string;
  title: string;
  published: boolean;
  created_by: string;
  ai_generation_id: string | null;
  created_at: string;
  updated_at: string;
}

interface RawCardRow {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  display_order: number;
  created_at: string;
}

function mapDeck(r: RawDeckRow): FlashcardDeckRow {
  return {
    id: r.id,
    lessonId: r.lesson_id,
    title: r.title,
    published: r.published,
    createdBy: r.created_by,
    aiGenerationId: r.ai_generation_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapCard(r: RawCardRow): FlashcardRow {
  return {
    id: r.id,
    deckId: r.deck_id,
    front: r.front,
    back: r.back,
    displayOrder: r.display_order,
    createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * List all decks for a lesson, with their cards. Teacher sees all; student
 * sees only published decks (enforced by RLS).
 */
export async function listFlashcardDecksForLesson(
  lessonId: string,
): Promise<FlashcardDeckView[]> {
  const supabase = await createClient();

  const { data: deckRows, error: dErr } = await supabase
    .from('flashcard_decks')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: false });

  if (dErr) throw new Error(dErr.message);
  const decks = ((deckRows ?? []) as RawDeckRow[]).map(mapDeck);

  if (decks.length === 0) return [];

  const deckIds = decks.map((d) => d.id);
  const { data: cardRows, error: cErr } = await supabase
    .from('flashcards')
    .select('*')
    .in('deck_id', deckIds)
    .order('display_order', { ascending: true });

  if (cErr) throw new Error(cErr.message);
  const cards = ((cardRows ?? []) as RawCardRow[]).map(mapCard);

  const cardsByDeck = new Map<string, FlashcardRow[]>();
  for (const c of cards) {
    const arr = cardsByDeck.get(c.deckId) ?? [];
    arr.push(c);
    cardsByDeck.set(c.deckId, arr);
  }

  return decks.map((d) => ({
    deck: d,
    cards: cardsByDeck.get(d.id) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Create deck + cards in one go (used by the AI route after generation)
// ---------------------------------------------------------------------------

export async function createFlashcardDeckWithCards(input: {
  lessonId: string;
  title: string;
  aiGenerationId: string | null;
  cards: Array<{ front: string; back: string }>;
}): Promise<{ deckId: string; insertedCount: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Insert the deck
  const { data: deckRow, error: dErr } = await supabase
    .from('flashcard_decks')
    .insert({
      lesson_id: input.lessonId,
      title: input.title || 'Flashcards',
      published: false,
      created_by: user.id,
      ai_generation_id: input.aiGenerationId,
    })
    .select('id, lesson_id')
    .single();

  if (dErr || !deckRow) {
    throw new Error(dErr?.message ?? 'Failed to create deck');
  }

  const deckId = (deckRow as { id: string }).id;

  // Insert cards
  if (input.cards.length > 0) {
    const rows = input.cards.map((c, idx) => ({
      deck_id: deckId,
      front: c.front,
      back: c.back,
      display_order: idx,
    }));
    const { error: cErr } = await supabase.from('flashcards').insert(rows);
    if (cErr) {
      // Best-effort rollback: delete the empty deck so we don't orphan it
      await supabase.from('flashcard_decks').delete().eq('id', deckId);
      throw new Error(`Failed to insert cards: ${cErr.message}`);
    }
  }

  return { deckId, insertedCount: input.cards.length };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function setDeckPublished(
  deckId: string,
  published: boolean,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('flashcard_decks')
    .update({ published })
    .eq('id', deckId);
  if (error) throw new Error(error.message);
  revalidatePath('/teacher', 'layout');
}

export async function updateDeckTitle(
  deckId: string,
  title: string,
): Promise<void> {
  const supabase = await createClient();
  const trimmed = title.trim();
  if (!trimmed) throw new Error('Title cannot be empty');
  const { error } = await supabase
    .from('flashcard_decks')
    .update({ title: trimmed })
    .eq('id', deckId);
  if (error) throw new Error(error.message);
}

export async function deleteDeck(deckId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('flashcard_decks')
    .delete()
    .eq('id', deckId);
  if (error) throw new Error(error.message);
}

export async function updateCard(
  cardId: string,
  patch: { front?: string; back?: string },
): Promise<void> {
  const supabase = await createClient();
  const update: Record<string, string> = {};
  if (patch.front !== undefined) {
    const t = patch.front.trim();
    if (!t) throw new Error('Front cannot be empty');
    update.front = t;
  }
  if (patch.back !== undefined) {
    const t = patch.back.trim();
    if (!t) throw new Error('Back cannot be empty');
    update.back = t;
  }
  if (Object.keys(update).length === 0) return;

  const { error } = await supabase
    .from('flashcards')
    .update(update)
    .eq('id', cardId);
  if (error) throw new Error(error.message);
}

export async function deleteCard(cardId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('flashcards')
    .delete()
    .eq('id', cardId);
  if (error) throw new Error(error.message);
}

export async function addCardToDeck(
  deckId: string,
  front: string,
  back: string,
): Promise<FlashcardRow> {
  const supabase = await createClient();
  const f = front.trim();
  const b = back.trim();
  if (!f || !b) throw new Error('Front and back are required');

  // Compute next display_order
  const { data: maxRow } = await supabase
    .from('flashcards')
    .select('display_order')
    .eq('deck_id', deckId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    ((maxRow as { display_order: number } | null)?.display_order ?? -1) + 1;

  const { data: inserted, error } = await supabase
    .from('flashcards')
    .insert({ deck_id: deckId, front: f, back: b, display_order: nextOrder })
    .select('*')
    .single();
  if (error || !inserted) {
    throw new Error(error?.message ?? 'Failed to add card');
  }
  return mapCard(inserted as RawCardRow);
}