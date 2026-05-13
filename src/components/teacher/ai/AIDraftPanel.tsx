'use client';

// src/components/teacher/ai/AIDraftPanel.tsx
// AI announcement drafter — sits inside the Composer when "AI Draft" mode is on.
// Owns: textarea input -> generate API call -> preview -> hand off body to parent.

import { useState } from 'react';
import { Loader2, Sparkles, X, RotateCcw } from 'lucide-react';

type Tone = 'informational' | 'urgent' | 'celebratory' | 'reminder';

type Draft = {
  title: string;
  body: string;
  tone: Tone;
};

type Props = {
  classId: string;
  /** Called when the teacher accepts a draft. Receives the combined markdown body. */
  onAccept: (combinedBody: string, generationId: string | null) => void;
  /** Called when the teacher cancels AI mode entirely. */
  onCancel: () => void;
};

function toneBadgeClass(tone: Tone): string {
  switch (tone) {
    case 'urgent':
      return 'bg-red-100 text-red-700';
    case 'celebratory':
      return 'bg-yellow-100 text-yellow-800';
    case 'reminder':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function combineTitleAndBody(title: string, body: string): string {
  const cleanTitle = title.trim().replace(/\*+/g, '');
  const cleanBody = body.trim();
  if (!cleanTitle) return cleanBody;
  return `**${cleanTitle}**\n\n${cleanBody}`;
}

export default function AIDraftPanel({ classId, onAccept, onCancel }: Props) {
  const [rawNote, setRawNote] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setIsGenerating(true);
    try {
      const res = await fetch('/api/ai/announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, rawNote }),
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
      setIsGenerating(false);
    }
  }

  function accept() {
    if (!draft) return;
    onAccept(combineTitleAndBody(draft.title, draft.body), generationId);
  }

  function regenerate() {
    setDraft(null);
    setGenerationId(null);
    setError(null);
  }

  // PREVIEW STATE
  if (draft) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-red-700">
            <Sparkles className="h-4 w-4" />
            AI Draft
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${toneBadgeClass(draft.tone)}`}
          >
            {draft.tone}
          </span>
        </div>

        <div className="rounded-lg bg-white p-3 border border-gray-200">
          <p className="font-semibold text-gray-900">{draft.title}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{draft.body}</p>
        </div>

        {error && <p className="text-xs text-amber-700">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={accept}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Use this draft
          </button>
          <button
            type="button"
            onClick={regenerate}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try again
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // INPUT STATE
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-red-700">
          <Sparkles className="h-4 w-4" />
          AI Draft Announcement
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <X className="h-3.5 w-3.5" />
          Close
        </button>
      </div>

      <p className="text-xs text-gray-600">
        Type a short note in English, Filipino, or Taglish. The AI will turn it
        into a polished announcement you can preview before posting.
      </p>

      <textarea
        value={rawNote}
        onChange={(e) => setRawNote(e.target.value)}
        rows={3}
        maxLength={2000}
        disabled={isGenerating}
        placeholder='e.g., "walang pasok bukas, baha" or "quiz moved to Friday"'
        className="w-full resize-none rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:bg-gray-50"
      />

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{rawNote.length} / 2000</p>
        <button
          type="button"
          onClick={generate}
          disabled={isGenerating || rawNote.trim().length < 3}
          className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate draft
            </>
          )}
        </button>
      </div>
    </div>
  );
}
