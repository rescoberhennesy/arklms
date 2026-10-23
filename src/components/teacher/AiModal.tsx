'use client';

import { useEffect } from 'react';
import { X, Sparkles, Loader2, RefreshCw } from 'lucide-react';

export default function AiModal({
  open,
  title,
  onClose,
  pending,
  error,
  onRegenerate,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  pending: boolean;
  error?: string | null;
  onRegenerate?: () => void;
  children?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
          <h2 id="ai-modal-title" className="flex items-center gap-2 text-base font-bold text-zinc-900">
            <Sparkles className="h-4 w-4 text-red-600" />
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {pending ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-sm text-zinc-500">
              <Loader2 className="h-6 w-6 animate-spin text-red-600" />
              Reading the numbers…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          ) : (
            children
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-5 py-3">
          <p className="text-[11px] text-zinc-400">AI suggestions. The numbers themselves are computed, not AI-generated.</p>
          {onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={pending}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              Regenerate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}