'use client';

import { useState } from 'react';
import { Layers, Play, ChevronLeft } from 'lucide-react';
import type { FlashcardDeckView } from '@/lib/actions/flashcards';
import FlashcardStudyMode from './FlashcardStudyMode';

export default function FlashcardDeckLauncher({
  decks,
}: {
  decks: FlashcardDeckView[];
}) {
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);

  // Only published decks with cards should reach students.
  const studyable = decks.filter((d) => d.deck.published && d.cards.length > 0);
  if (studyable.length === 0) return null;

  const activeDeck = activeDeckId
    ? studyable.find((d) => d.deck.id === activeDeckId) ?? null
    : null;

  if (activeDeck) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setActiveDeckId(null)}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to flashcards
        </button>
        <FlashcardStudyMode deck={activeDeck} />
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        <Layers className="h-4 w-4 text-purple-600" />
        Flashcards
      </h2>
      <ul className="space-y-2">
        {studyable.map((d) => {
          const count = d.cards.length;
          return (
            <li key={d.deck.id}>
              <button
                type="button"
                onClick={() => setActiveDeckId(d.deck.id)}
                className="group flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left transition hover:border-purple-300 hover:bg-purple-50/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600 transition group-hover:bg-purple-100">
                  <Layers className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-gray-900">
                    {d.deck.title}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {count} {count === 1 ? 'card' : 'cards'}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition group-hover:bg-purple-700">
                  <Play className="h-3.5 w-3.5" fill="currentColor" />
                  Study now
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}