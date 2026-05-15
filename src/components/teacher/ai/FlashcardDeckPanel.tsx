// src/components/teacher/ai/FlashcardDeckPanel.tsx
//
// Teacher-side panel rendered inside LessonEditor.
// Shows all flashcard decks for the lesson + "Generate with AI" button.
// Each deck can be expanded to inline-edit individual cards.

'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Layers,
  Loader2,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  listFlashcardDecksForLesson,
  setDeckPublished,
  updateDeckTitle,
  deleteDeck,
  updateCard,
  deleteCard,
  addCardToDeck,
  type FlashcardDeckView,
} from '@/lib/actions/flashcards';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';

interface FlashcardDeckPanelProps {
  lessonId: string;
}

export default function FlashcardDeckPanel({ lessonId }: FlashcardDeckPanelProps) {
  const router = useRouter();
  const [decks, setDecks] = useState<FlashcardDeckView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(false);

  async function refresh() {
    try {
      const data = await listFlashcardDecksForLesson(lessonId);
      setDecks(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load decks');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          <Layers className="h-4 w-4 text-purple-600" />
          Flashcards
        </h2>
        <button
          type="button"
          onClick={() => setGenOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Generate with AI
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading decks...
        </div>
      ) : decks.length === 0 ? (
        <p className="text-sm italic text-gray-400">
          No flashcard decks yet. Click &ldquo;Generate with AI&rdquo; to create one.
        </p>
      ) : (
        <ul className="space-y-3">
          {decks.map((d) => (
            <li key={d.deck.id}>
              <DeckRow
                deck={d}
                onChanged={refresh}
                onError={setError}
              />
            </li>
          ))}
        </ul>
      )}

      <AIFlashcardGeneratorModal
        open={genOpen}
        lessonId={lessonId}
        onClose={() => setGenOpen(false)}
        onGenerated={() => {
          refresh();
          router.refresh();
        }}
      />
    </section>
  );
}

// ===========================================================================
// Single deck row (collapsible)
// ===========================================================================

function DeckRow({
  deck,
  onChanged,
  onError,
}: {
  deck: FlashcardDeckView;
  onChanged: () => void;
  onError: (m: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(deck.deck.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleTogglePublish() {
    onError(null);
    startTransition(async () => {
      try {
        await setDeckPublished(deck.deck.id, !deck.deck.published);
        onChanged();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to toggle publish');
      }
    });
  }

  async function handleSaveTitle() {
    const t = titleDraft.trim();
    if (!t || t === deck.deck.title) {
      setEditingTitle(false);
      setTitleDraft(deck.deck.title);
      return;
    }
    onError(null);
    startTransition(async () => {
      try {
        await updateDeckTitle(deck.deck.id, t);
        setEditingTitle(false);
        onChanged();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to rename');
      }
    });
  }

  async function handleDeleteDeck() {
    onError(null);
    startTransition(async () => {
      try {
        await deleteDeck(deck.deck.id);
        setConfirmDelete(false);
        onChanged();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to delete deck');
      }
    });
  }

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50/40">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded p-1 text-gray-500 hover:bg-gray-200"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <div className="flex items-center gap-1">
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') {
                    setTitleDraft(deck.deck.title);
                    setEditingTitle(false);
                  }
                }}
                autoFocus
                className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm focus:border-purple-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveTitle}
                className="rounded p-1 text-green-600 hover:bg-green-100"
                aria-label="Save"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(deck.deck.title);
                  setEditingTitle(false);
                }}
                className="rounded p-1 text-gray-400 hover:bg-gray-100"
                aria-label="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-gray-900">
                {deck.deck.title}
              </h3>
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                aria-label="Rename"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <span className="text-xs text-gray-500">
                · {deck.cards.length} {deck.cards.length === 1 ? 'card' : 'cards'}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleTogglePublish}
          disabled={isPending}
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
            deck.deck.published
              ? 'bg-green-100 text-green-800 hover:bg-green-200'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          } disabled:opacity-50`}
        >
          {deck.deck.published ? (
            <>
              <Eye className="h-3 w-3" /> Published
            </>
          ) : (
            <>
              <EyeOff className="h-3 w-3" /> Draft
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
          aria-label="Delete deck"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-200 bg-white p-3">
          <CardList
            deckId={deck.deck.id}
            cards={deck.cards}
            onChanged={onChanged}
            onError={onError}
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this flashcard deck?"
        message={`"${deck.deck.title}" and all ${deck.cards.length} cards will be permanently deleted.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteDeck}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

// ===========================================================================
// Card list (inline editor)
// ===========================================================================

function CardList({
  deckId,
  cards,
  onChanged,
  onError,
}: {
  deckId: string;
  cards: { id: string; front: string; back: string }[];
  onChanged: () => void;
  onError: (m: string | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [addFront, setAddFront] = useState('');
  const [addBack, setAddBack] = useState('');
  const [isPending, startTransition] = useTransition();

  async function handleAdd() {
    onError(null);
    startTransition(async () => {
      try {
        await addCardToDeck(deckId, addFront, addBack);
        setAddFront('');
        setAddBack('');
        setAdding(false);
        onChanged();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to add card');
      }
    });
  }

  return (
    <div className="space-y-2">
      {cards.length === 0 && (
        <p className="text-xs italic text-gray-400">No cards in this deck.</p>
      )}

      {cards.map((c, idx) => (
        <CardEditor
          key={c.id}
          index={idx}
          card={c}
          onChanged={onChanged}
          onError={onError}
        />
      ))}

      {adding ? (
        <div className="rounded-md border border-purple-200 bg-purple-50/30 p-2">
          <div className="mb-2 grid gap-2 sm:grid-cols-2">
            <textarea
              value={addFront}
              onChange={(e) => setAddFront(e.target.value)}
              placeholder="Front (question / term)"
              className="rounded border border-gray-200 px-2 py-1 text-sm focus:border-purple-500 focus:outline-none"
              rows={2}
            />
            <textarea
              value={addBack}
              onChange={(e) => setAddBack(e.target.value)}
              placeholder="Back (answer)"
              className="rounded border border-gray-200 px-2 py-1 text-sm focus:border-purple-500 focus:outline-none"
              rows={2}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setAddFront('');
                setAddBack('');
              }}
              className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={isPending || !addFront.trim() || !addBack.trim()}
              className="inline-flex items-center gap-1 rounded bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              Add card
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700"
        >
          <Plus className="h-3 w-3" />
          Add card manually
        </button>
      )}
    </div>
  );
}

function CardEditor({
  index,
  card,
  onChanged,
  onError,
}: {
  index: number;
  card: { id: string; front: string; back: string };
  onChanged: () => void;
  onError: (m: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [isPending, startTransition] = useTransition();

  async function handleSave() {
    onError(null);
    startTransition(async () => {
      try {
        await updateCard(card.id, { front, back });
        setEditing(false);
        onChanged();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to save');
      }
    });
  }

  async function handleDelete() {
    onError(null);
    startTransition(async () => {
      try {
        await deleteCard(card.id);
        onChanged();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to delete');
      }
    });
  }

  if (editing) {
    return (
      <div className="rounded-md border border-purple-200 bg-purple-50/30 p-2">
        <div className="mb-2 grid gap-2 sm:grid-cols-2">
          <textarea
            value={front}
            onChange={(e) => setFront(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1 text-sm focus:border-purple-500 focus:outline-none"
            rows={2}
          />
          <textarea
            value={back}
            onChange={(e) => setBack(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1 text-sm focus:border-purple-500 focus:outline-none"
            rows={2}
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setFront(card.front);
              setBack(card.back);
              setEditing(false);
            }}
            className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || !front.trim() || !back.trim()}
            className="inline-flex items-center gap-1 rounded bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2 rounded-md border border-gray-200 bg-white px-3 py-2">
      <span className="mt-0.5 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500">
        {index + 1}
      </span>
      <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-2">
        <p className="text-sm text-gray-900">
          <span className="text-xs font-semibold text-purple-700">Front: </span>
          {card.front}
        </p>
        <p className="text-sm text-gray-700">
          <span className="text-xs font-semibold text-purple-700">Back: </span>
          {card.back}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Edit"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
          aria-label="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// AI generator modal
// ===========================================================================

function AIFlashcardGeneratorModal({
  open,
  lessonId,
  onClose,
  onGenerated,
}: {
  open: boolean;
  lessonId: string;
  onClose: () => void;
  onGenerated: () => void;
}) {
  const [title, setTitle] = useState('Flashcards');
  const [desiredCount, setDesiredCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{
    insertedCount: number;
    sourceNote: string | null;
  } | null>(null);
  const [aiDecline, setAiDecline] = useState<string | null>(null);

  function resetAndClose() {
    setTitle('Flashcards');
    setDesiredCount(10);
    setLoading(false);
    setErrorMsg(null);
    setResult(null);
    setAiDecline(null);
    onClose();
  }

  async function handleGenerate() {
    setLoading(true);
    setErrorMsg(null);
    setResult(null);
    setAiDecline(null);
    try {
      const res = await fetch('/api/ai/flashcards/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId, desiredCount, title }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || 'Failed to generate flashcards.');
      } else if (json.ok === false && json.errorMessage) {
        setAiDecline(json.errorMessage);
      } else {
        setResult({
          insertedCount: json.insertedCount,
          sourceNote: json.sourceNote ?? null,
        });
        onGenerated();
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-purple-900">
            <Sparkles className="h-4 w-4 text-purple-600" />
            Generate flashcards
          </h2>
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {result ? (
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-green-700">
                ✓ Created {result.insertedCount} cards
              </p>
              {result.sourceNote && (
                <p className="text-gray-600">{result.sourceNote}</p>
              )}
              <p className="text-xs text-gray-500">
                Review them below, edit as needed, then publish the deck so
                students can study.
              </p>
              <button
                type="button"
                onClick={resetAndClose}
                className="mt-2 w-full rounded-md bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700"
              >
                Done
              </button>
            </div>
          ) : aiDecline ? (
            <div className="space-y-2">
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {aiDecline}
              </div>
              <button
                type="button"
                onClick={resetAndClose}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Deck title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Flashcards"
                  disabled={loading}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none disabled:opacity-60"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Number of cards
                </label>
                <input
                  type="number"
                  min={3}
                  max={20}
                  step={1}
                  value={desiredCount}
                  onChange={(e) =>
                    setDesiredCount(Math.max(3, Math.min(20, Number(e.target.value) || 10)))
                  }
                  disabled={loading}
                  className="w-32 rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none disabled:opacity-60"
                />
                <p className="mt-1 text-xs text-gray-500">
                  AI may return fewer cards if the lesson doesn&apos;t support that many.
                </p>
              </div>

              {errorMsg && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errorMsg}
                </div>
              )}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}