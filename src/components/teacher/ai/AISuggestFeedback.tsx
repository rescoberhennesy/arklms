'use client';

// src/components/teacher/ai/AISuggestFeedback.tsx
// Two-part UI: a compact button (rendered inline) and a full-width
// suggestion card (rendered in a separate slot below the parent's row).
//
// Usage:
//   <AISuggestFeedback ... />          ← renders ONLY the button
//   <AISuggestFeedbackCard ... />      ← renders ONLY the card (full width)
//
// Both share state through a small context so they stay in sync even
// when placed in different parts of the DOM.

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { Loader2, Sparkles, X, Check } from 'lucide-react';

type Tone = 'encouraging' | 'balanced' | 'celebratory';
type Draft = { feedback: string; tone: Tone };

type SharedState = {
  isLoading: boolean;
  error: string | null;
  draft: Draft | null;
  generationId: string | null;
  endpoint: string;
  body: Record<string, unknown>;
  disabled: boolean;
  disabledReason?: string;
  onAccept: (feedback: string, generationId: string | null) => void;
  suggest: () => Promise<void>;
  dismiss: () => void;
};

const Ctx = createContext<SharedState | null>(null);

function useAICtx(): SharedState {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      'AISuggestFeedback components must be wrapped in <AISuggestFeedbackProvider>.',
    );
  }
  return ctx;
}

// ============================================================
// Provider — owns the shared state. Wrap the section that
// contains BOTH the button and the card.
// ============================================================

type ProviderProps = {
  endpoint: string;
  body: Record<string, unknown>;
  disabled?: boolean;
  disabledReason?: string;
  onAccept: (feedback: string, generationId: string | null) => void;
  children: ReactNode;
};

export function AISuggestFeedbackProvider({
  endpoint,
  body,
  disabled,
  disabledReason,
  onAccept,
  children,
}: ProviderProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);

  async function suggest() {
    setError(null);
    setIsLoading(true);
    setDraft(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to generate.');
        return;
      }
      setDraft(json.draft as Draft);
      setGenerationId(json.generationId ?? null);
      if (json.warning) setError(json.warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setIsLoading(false);
    }
  }

  function dismiss() {
    setDraft(null);
    setGenerationId(null);
    setError(null);
  }

  const value: SharedState = {
    isLoading,
    error,
    draft,
    generationId,
    endpoint,
    body,
    disabled: !!disabled,
    disabledReason,
    onAccept: (fb, id) => {
      onAccept(fb, id);
      setDraft(null);
      setGenerationId(null);
    },
    suggest,
    dismiss,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ============================================================
// Button — compact, inline. Renders next to a label.
// ============================================================

export function AISuggestFeedbackButton() {
  const { isLoading, disabled, disabledReason, suggest, draft } = useAICtx();

  // Hide the button while a draft is shown (the card has its own controls).
  if (draft) return null;

  return (
    <button
      type="button"
      onClick={suggest}
      disabled={disabled || isLoading}
      title={disabled ? disabledReason : undefined}
      className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
    >
      {isLoading ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Generating…
        </>
      ) : (
        <>
          <Sparkles className="h-3.5 w-3.5" />
          Suggest feedback
        </>
      )}
    </button>
  );
}

// ============================================================
// Card — full-width suggestion preview. Renders below the label row.
// Returns null when there's nothing to show, so it doesn't take up space.
// ============================================================

function toneBadgeClass(tone: Tone): string {
  switch (tone) {
    case 'celebratory':
      return 'bg-green-100 text-green-700';
    case 'encouraging':
      return 'bg-blue-100 text-blue-700';
    case 'balanced':
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export function AISuggestFeedbackCard() {
  const { draft, error, generationId, onAccept, suggest, dismiss } = useAICtx();

  // Render the error inline (without a card wrapper) when there's no draft.
  if (!draft) {
    if (error) {
      return <p className="mt-1 text-xs text-red-600">{error}</p>;
    }
    return null;
  }

  return (
    <div className="mt-2 rounded-lg border border-red-200 bg-red-50/50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
          <Sparkles className="h-3.5 w-3.5" />
          AI suggestion
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${toneBadgeClass(
            draft.tone,
          )}`}
        >
          {draft.tone}
        </span>
      </div>

      <div className="rounded-md bg-white border border-gray-200 p-2.5 text-sm text-gray-800 whitespace-pre-wrap">
        {draft.feedback}
      </div>

      {error && <p className="text-[11px] text-amber-700">{error}</p>}

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onAccept(draft.feedback, generationId)}
          className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          <Check className="h-3 w-3" />
          Use this
        </button>
        <button
          type="button"
          onClick={suggest}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <X className="h-3 w-3" />
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Convenience default export — backward-compatible single-slot
// version for places that just want one thing rendered.
// Renders BUTTON + CARD stacked, button on top.
// ============================================================

type AllInOneProps = {
  endpoint: string;
  body: Record<string, unknown>;
  disabled?: boolean;
  disabledReason?: string;
  onAccept: (feedback: string, generationId: string | null) => void;
};

export default function AISuggestFeedback(props: AllInOneProps) {
  return (
    <AISuggestFeedbackProvider {...props}>
      <div className="space-y-2">
        <AISuggestFeedbackButton />
        <AISuggestFeedbackCard />
      </div>
    </AISuggestFeedbackProvider>
  );
}
