// src/components/student/FlashcardStudyMode.tsx
//
// Student-facing flashcard study.
//
// Two modes (toggle at the top):
//   - Learn (default): Quizlet-style multiple choice. Question = card front,
//     options = correct back + up to 3 backs from other cards. Wrong / "Don't
//     know" cards return to the end of the queue until answered correctly.
//     Final score = cards answered correctly on the FIRST try.
//   - Flashcards: classic flip card with "Knew it" / "Didn't know"
//     (one review round for missed cards; latest answer wins).
//
// All tracking is in-memory only. No DB writes for study sessions.
// Defense story: mastery tracking belongs in graded quizzes, not study aids.

'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  RotateCcw,
  Check,
  X,
  Layers,
  Trophy,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { FlashcardDeckView } from '@/lib/actions/flashcards';
import InlineMarkdown from '@/components/shared/InlineMarkdown';

interface FlashcardStudyModeProps {
  deck: FlashcardDeckView;
}

interface CardResult {
  cardId: string;
  knew: boolean;
}

type Card = FlashcardDeckView['cards'][number];
type Mode = 'learn' | 'flip';

// ===========================================================================
// Wrapper with mode toggle
// ===========================================================================

export default function FlashcardStudyMode({ deck }: FlashcardStudyModeProps) {
  const canLearn = deck.cards.length >= 2;
  const [mode, setMode] = useState<Mode>(canLearn ? 'learn' : 'flip');

  if (deck.cards.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
        This deck has no cards yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {canLearn && (
        <div className="flex justify-end">
          <div
            role="tablist"
            aria-label="Study mode"
            className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-medium"
          >
            {(['learn', 'flip'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 transition ${
                  mode === m
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {m === 'learn' ? 'Learn' : 'Flashcards'}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'learn' && canLearn ? (
        <LearnStudy key={`learn-${deck.deck.id}`} deck={deck} />
      ) : (
        <FlipStudy key={`flip-${deck.deck.id}`} deck={deck} />
      )}
    </div>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Compare answers ignoring markdown markers, spacing and case.
function normalize(s: string): string {
  return s.replace(/[*`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

type Option = { text: string; correct: boolean };

function buildOptions(card: Card, allCards: Card[]): Option[] {
  const seen = new Set<string>([normalize(card.back)]);
  const distractors: string[] = [];
  for (const c of shuffle(allCards)) {
    if (c.id === card.id) continue;
    const n = normalize(c.back);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    distractors.push(c.back);
    if (distractors.length === 3) break;
  }
  return shuffle([
    { text: card.back, correct: true },
    ...distractors.map((text) => ({ text, correct: false })),
  ]);
}

const IGNORED_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock']);

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

// ===========================================================================
// Learn mode (multiple choice)
// ===========================================================================

type LearnAnswer = { picked: number | null; correct: boolean };

function LearnStudy({ deck }: FlashcardStudyModeProps) {
  const cards = deck.cards;
  const total = cards.length;

  const initialQueue = useMemo(() => cards.map((c) => c.id), [cards]);

  const [queue, setQueue] = useState<string[]>(initialQueue);
  const [results, setResults] = useState<CardResult[]>([]);
  const [answer, setAnswer] = useState<LearnAnswer | null>(null);
  const [askKey, setAskKey] = useState(0); // bump to reshuffle options
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cardsById = useMemo(() => {
    const m = new Map<string, Card>();
    for (const c of cards) m.set(c.id, c);
    return m;
  }, [cards]);

  const currentId = queue[0];
  const currentCard = currentId ? cardsById.get(currentId) ?? null : null;

  const options = useMemo(
    () => (currentCard ? buildOptions(currentCard, cards) : []),
    // askKey forces new shuffled options when a card comes back around
    [currentCard, cards, askKey],
  );

  // Latest result per card
  const latestByCard = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const r of results) m.set(r.cardId, r.knew);
    return m;
  }, [results]);
  const masteredCount = Array.from(latestByCard.values()).filter(Boolean).length;
  const needReviewCount = Array.from(latestByCard.values()).filter((v) => !v).length;

  const choose = useCallback(
    (index: number | null) => {
      if (answer || !currentId) return;
      const correct = index !== null && options[index]?.correct === true;
      setAnswer({ picked: index, correct });
      setResults((prev) => [...prev, { cardId: currentId, knew: correct }]);
    },
    [answer, currentId, options],
  );

  const advance = useCallback(() => {
    if (!answer) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // Wrong / don't know → card goes to the end of the queue
    setQueue((prev) =>
      prev.length === 0
        ? prev
        : answer.correct
          ? prev.slice(1)
          : [...prev.slice(1), prev[0]],
    );
    setAnswer(null);
    setAskKey((k) => k + 1);
  }, [answer]);

  // Auto-advance after a correct answer
  useEffect(() => {
    if (!answer?.correct) return;
    timer.current = setTimeout(advance, 900);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [answer, advance]);

  // Keyboard: 1-4 pick an option; any key continues after answering
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!currentCard || e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (!answer) {
        const n = Number(e.key);
        if (Number.isInteger(n) && n >= 1 && n <= options.length) {
          e.preventDefault();
          choose(n - 1);
        }
        return;
      }
      if (IGNORED_KEYS.has(e.key)) return;
      e.preventDefault();
      advance();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentCard, answer, options.length, choose, advance]);

  const handleRestart = useCallback(() => {
    setQueue(initialQueue);
    setResults([]);
    setAnswer(null);
    setAskKey((k) => k + 1);
  }, [initialQueue]);

  // Done
  if (!currentCard) {
    const firstTry = new Map<string, boolean>();
    for (const r of results) {
      if (!firstTry.has(r.cardId)) firstTry.set(r.cardId, r.knew);
    }
    const knewFirst = Array.from(firstTry.values()).filter(Boolean).length;
    return (
      <StudyComplete
        knew={knewFirst}
        total={total}
        label="Correct on first try"
        onRestart={handleRestart}
      />
    );
  }

  let status: { text: string; className: string };
  if (!answer) {
    status = { text: 'Choose an answer', className: 'text-gray-500' };
  } else if (answer.correct) {
    status = { text: "Nice! That's correct.", className: 'text-green-700' };
  } else if (answer.picked === null) {
    status = {
      text: "Here's the answer. You'll see this one again.",
      className: 'text-amber-700',
    };
  } else {
    status = {
      text: 'No worries. Learning is a process!',
      className: 'text-orange-600',
    };
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Layers className="h-4 w-4 text-purple-600" />
          {deck.deck.title}
        </div>
        <div className="text-xs text-gray-600">
          Mastered {masteredCount} of {total}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full bg-purple-500 transition-all"
          style={{ width: `${(masteredCount / total) * 100}%` }}
        />
      </div>

      {/* Question */}
      <div className="mb-5 rounded-xl border-2 border-purple-100 bg-gradient-to-br from-purple-50 to-white p-6">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-purple-600">
          Question
        </div>
        <div className="text-lg leading-relaxed text-gray-900">
          <InlineMarkdown text={currentCard.front} />
        </div>
      </div>

      {/* Status line */}
      <p className={`mb-3 text-sm font-semibold ${status.className}`}>
        {status.text}
      </p>

      {/* Options */}
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((opt, i) => {
          const isPicked = answer?.picked === i;
          let cls: string;
          let badge: React.ReactNode;

          if (!answer) {
            cls =
              'border-gray-200 bg-white hover:border-purple-400 hover:bg-purple-50 cursor-pointer';
            badge = i + 1;
          } else if (opt.correct) {
            cls = answer.correct
              ? 'border-green-500 bg-green-50'
              : 'border-dashed border-green-500 bg-green-50';
            badge = <Check className="h-4 w-4 text-green-600" />;
          } else if (isPicked) {
            cls = 'border-orange-500 bg-orange-50';
            badge = <X className="h-4 w-4 text-orange-600" />;
          } else {
            cls = 'border-gray-100 bg-gray-50 opacity-50';
            badge = i + 1;
          }

          return (
            <button
              key={i}
              type="button"
              disabled={!!answer}
              onClick={() => choose(i)}
              className={`flex w-full items-start gap-3 rounded-lg border-2 px-4 py-3 text-left text-sm text-gray-900 transition disabled:cursor-default ${cls}`}
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-xs font-semibold text-gray-500">
                {badge}
              </span>
              <span className="flex-1 leading-relaxed">
                <InlineMarkdown text={opt.text} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-4 flex min-h-[40px] items-center justify-between gap-3">
        {!answer ? (
          <button
            type="button"
            onClick={() => choose(null)}
            className="mx-auto text-sm font-medium text-purple-600 hover:text-purple-800"
          >
            Don&apos;t know?
          </button>
        ) : answer.correct ? (
          <p className="mx-auto text-xs text-gray-400">Next question…</p>
        ) : (
          <>
            <span className="hidden text-xs font-medium text-gray-500 sm:inline">
              Press any key to continue
            </span>
            <button
              type="button"
              autoFocus
              onClick={advance}
              className="ml-auto inline-flex items-center gap-2 rounded-full bg-purple-600 px-5 py-2 text-sm font-semibold text-white hover:bg-purple-700"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* Running tally */}
      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500">
        <span>
          Mastered: <strong className="text-green-700">{masteredCount}</strong>
        </span>
        <span>
          Need review: <strong className="text-red-700">{needReviewCount}</strong>
        </span>
      </div>
    </div>
  );
}

// ===========================================================================
// Flip mode (browse cards: flip + previous/next, no scoring)
// ===========================================================================

function FlipStudy({ deck }: FlashcardStudyModeProps) {
  const cards = deck.cards;
  const total = cards.length;

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const card = cards[index];
  const isFirst = index === 0;
  const isLast = index === total - 1;

  const handleFlip = useCallback(() => setFlipped((v) => !v), []);

  const goTo = useCallback(
    (next: number) => {
      setIndex(Math.min(total - 1, Math.max(0, next)));
      setFlipped(false);
    },
    [total],
  );

  // Keyboard: Space/Enter flips, ← previous, → next
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleFlip();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goTo(index - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goTo(index + 1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, handleFlip, goTo]);

  if (!card) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Layers className="h-4 w-4 text-purple-600" />
          {deck.deck.title}
        </div>
        <div className="text-xs text-gray-600">
          Card {index + 1} of {total}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full bg-purple-500 transition-all"
          style={{ width: `${((index + 1) / total) * 100}%` }}
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
          <InlineMarkdown text={flipped ? card.back : card.front} />
        </div>
        <div className="mt-4 text-xs text-gray-400">
          {flipped ? 'Click to show question' : 'Click to reveal answer'}
        </div>
      </button>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={isFirst}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>

        <span className="hidden text-xs text-gray-400 sm:inline">
          Space to flip · ← → to move
        </span>

        {isLast ? (
          <button
            type="button"
            onClick={() => goTo(0)}
            className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            <RotateCcw className="h-4 w-4" />
            Start over
          </button>
        ) : (
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Completion screen (shared)
// ===========================================================================

function StudyComplete({
  knew,
  total,
  label,
  onRestart,
}: {
  knew: number;
  total: number;
  label: string;
  onRestart: () => void;
}) {
  const pct = total === 0 ? 0 : Math.round((knew / total) * 100);

  let message: string;
  let messageColor: string;
  if (pct >= 90) {
    message = 'Excellent! You really know this material.';
    messageColor = 'text-green-700';
  } else if (pct >= 70) {
    message = 'Good work — a few more reviews and you have it.';
    messageColor = 'text-blue-700';
  } else if (pct >= 50) {
    message = "Keep practicing. You're building familiarity.";
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
          <span className="font-medium text-gray-700">{label}</span>
          <span className="font-bold text-purple-700">
            {knew} / {total} ({pct}%)
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="h-full bg-purple-500" style={{ width: `${pct}%` }} />
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
                <p className="text-sm font-medium text-gray-900">{d.deck.title}</p>
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