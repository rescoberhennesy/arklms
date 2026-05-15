// src/components/student/FlashcardStudyMode.tsx
//
// Student-facing flashcard study mode.
//
// Design (locked):
//   - Flip card UI: click card OR press space to reveal the back.
//   - After revealing, student picks "Knew it" / "Didn't know" — affects
//     in-memory tracking only. No DB writes for study sessions.
//   - At end of deck, show a summary + restart option.
//   - Wrong-pile shuffle: cards marked "didn't know" cycle back into the
//     queue once before the deck ends.
//
// Defense story: mastery tracking belongs in graded quizzes, not study aids.
// Self-study sessions are private and ephemeral by design.

'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  RotateCcw,
  Check,
  X,
  Layers,
  Trophy,
  ArrowRight,
} from 'lucide-react';
import type { FlashcardDeckView } from '@/lib/actions/flashcards';

interface FlashcardStudyModeProps {
  deck: FlashcardDeckView;
}

interface CardResult {
  cardId: string;
  knew: boolean;
}

export default function FlashcardStudyMode({ deck }: FlashcardStudyModeProps) {
  // Original deck order (we may reshuffle "didn't know" cards back in)
  const initialQueue = useMemo(
    () => deck.cards.map((c) => c.id),
    [deck.cards],
  );

  const [queue, setQueue] = useState<string[]>(initialQueue);
  const [results, setResults] = useState<CardResult[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [retried, setRetried] = useState(false); // have we re-queued unknowns once?

  const cardsById = useMemo(() => {
    const m = new Map<string, (typeof deck.cards)[number]>();
    for (const c of deck.cards) m.set(c.id, c);
    return m;
  }, [deck.cards]);

  const currentId = queue[0];
  const currentCard = currentId ? cardsById.get(currentId) : null;
  const cardIndex = deck.cards.length - queue.length + 1;
  const total = deck.cards.length;

  // -------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------

  const handleFlip = useCallback(() => {
    setFlipped((v) => !v);
  }, []);

  const handleAnswer = useCallback(
    (knew: boolean) => {
      if (!currentId) return;
      setResults((prev) => [...prev, { cardId: currentId, knew }]);
      setQueue((prev) => prev.slice(1));
      setFlipped(false);
    },
    [currentId],
  );

  const handleRestart = useCallback(() => {
    setQueue(initialQueue);
    setResults([]);
    setFlipped(false);
    setRetried(false);
  }, [initialQueue]);

  // Keyboard shortcuts: Space flips, 1 = knew, 2 = didn't know
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!currentCard) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleFlip();
      } else if (flipped) {
        if (e.key === '1') handleAnswer(true);
        if (e.key === '2') handleAnswer(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentCard, flipped, handleFlip, handleAnswer]);

  // After the queue empties, re-queue the cards the student didn't know
  // (one round of retries only)
  useEffect(() => {
    if (queue.length === 0 && !retried) {
      const unknownIds = results
        .filter((r) => !r.knew)
        .map((r) => r.cardId);
      if (unknownIds.length > 0) {
        setQueue(unknownIds);
        setRetried(true);
      }
    }
  }, [queue, results, retried]);

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  if (deck.cards.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
        This deck has no cards yet.
      </div>
    );
  }

  // Done state
  if (!currentCard) {
    return <StudyComplete deck={deck} results={results} onRestart={handleRestart} />;
  }

  const knewCount = results.filter((r) => r.knew).length;
  const wrongCount = results.length - knewCount;
  const retryBadge = retried ? ' · review round' : '';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Layers className="h-4 w-4 text-purple-600" />
          {deck.deck.title}
        </div>
        <div className="text-xs text-gray-600">
          Card {Math.min(cardIndex, total)} of {total}
          {retryBadge}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full bg-purple-500 transition-all"
          style={{
            width: `${total === 0 ? 0 : (results.length / (total + (retried ? wrongCount : 0))) * 100}%`,
          }}
        />
      </div>

      {/* Card */}
      <button
        type="button"
        onClick={handleFlip}
        className="group relative mb-4 block w-full cursor-pointer select-none rounded-xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-white p-8 text-center shadow-sm transition hover:border-purple-400 focus:border-purple-500 focus:outline-none"
        aria-label="Flip card"
      >
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-purple-600">
          {flipped ? 'Answer' : 'Question'}
        </div>
        <div className="min-h-[120px] whitespace-pre-wrap text-lg leading-relaxed text-gray-900">
          {flipped ? currentCard.back : currentCard.front}
        </div>
        <div className="mt-4 text-xs text-gray-400">
          {flipped ? 'Click to show question' : 'Click to reveal answer'}
        </div>
      </button>

      {/* Action buttons (visible after flip) */}
      {flipped ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleAnswer(false)}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            <X className="h-4 w-4" />
            Didn&apos;t know
            <kbd className="ml-1 hidden rounded bg-red-200 px-1 text-xs sm:inline">
              2
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => handleAnswer(true)}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700 hover:bg-green-100"
          >
            <Check className="h-4 w-4" />
            Knew it
            <kbd className="ml-1 hidden rounded bg-green-200 px-1 text-xs sm:inline">
              1
            </kbd>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleFlip}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-700"
        >
          Reveal answer
          <kbd className="ml-1 hidden rounded bg-purple-700 px-1 text-xs sm:inline">
            Space
          </kbd>
        </button>
      )}

      {/* Running tally */}
      <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
        <span>
          Knew: <strong className="text-green-700">{knewCount}</strong>
        </span>
        <span>
          Need review: <strong className="text-red-700">{wrongCount}</strong>
        </span>
      </div>
    </div>
  );
}

// ===========================================================================
// Completion screen
// ===========================================================================

function StudyComplete({
  deck,
  results,
  onRestart,
}: {
  deck: FlashcardDeckView;
  results: CardResult[];
  onRestart: () => void;
}) {
  // Tally by card id — student may have answered the same card twice in retry round
  const finalByCard = new Map<string, boolean>();
  for (const r of results) {
    // Latest answer wins
    finalByCard.set(r.cardId, r.knew);
  }
  const knewFinal = Array.from(finalByCard.values()).filter(Boolean).length;
  const totalUnique = deck.cards.length;
  const pct = totalUnique === 0 ? 0 : Math.round((knewFinal / totalUnique) * 100);

  let message: string;
  let messageColor: string;
  if (pct >= 90) {
    message = 'Excellent! You really know this material.';
    messageColor = 'text-green-700';
  } else if (pct >= 70) {
    message = 'Good work — a few more reviews and you have it.';
    messageColor = 'text-blue-700';
  } else if (pct >= 50) {
    message = 'Keep practicing. You\'re building familiarity.';
    messageColor = 'text-amber-700';
  } else {
    message = 'Take another pass through the lesson, then try again.';
    messageColor = 'text-rose-700';
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
      <Trophy className="mx-auto mb-3 h-10 w-10 text-amber-500" />
      <h2 className="text-lg font-semibold text-gray-900">Study session complete</h2>
      <p className={`mt-2 text-sm font-medium ${messageColor}`}>{message}</p>

      <div className="mx-auto mt-6 max-w-xs">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-gray-700">Final score</span>
          <span className="font-bold text-purple-700">
            {knewFinal} / {totalUnique} ({pct}%)
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full bg-purple-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
      >
        <RotateCcw className="h-4 w-4" />
        Study again
      </button>
    </div>
  );
}

// ===========================================================================
// Multi-deck launcher: list of available decks the student can open
// (used by the student lesson page below)
// ===========================================================================

export function FlashcardDeckLauncher({
  decks,
}: {
  decks: FlashcardDeckView[];
}) {
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);

  // Only published decks should reach here, but defense-in-depth filter
  const publishedDecks = decks.filter((d) => d.deck.published);

  if (publishedDecks.length === 0) return null;

  const activeDeck = activeDeckId
    ? publishedDecks.find((d) => d.deck.id === activeDeckId) ?? null
    : null;

  if (activeDeck) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setActiveDeckId(null)}
          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
        >
          ← Back to deck list
        </button>
        <FlashcardStudyMode deck={activeDeck} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        <Layers className="h-4 w-4 text-purple-600" />
        Flashcards
      </h2>
      <ul className="space-y-2">
        {publishedDecks.map((d) => (
          <li key={d.deck.id}>
            <button
              type="button"
              onClick={() => setActiveDeckId(d.deck.id)}
              className="flex w-full items-center justify-between rounded-md border border-gray-200 bg-gray-50/40 px-3 py-2 text-left hover:border-purple-200 hover:bg-purple-50/40"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {d.deck.title}
                </p>
                <p className="text-xs text-gray-500">
                  {d.cards.length} {d.cards.length === 1 ? 'card' : 'cards'}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-purple-600" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}