// src/components/teacher/ConfirmDialog.tsx
'use client';

import { useEffect, useTransition, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleConfirm() {
    startTransition(async () => {
      try {
        await onConfirm();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-start gap-3 px-5 py-4">
          {destructive && (
            <div className="mt-0.5 rounded-full bg-red-100 p-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <div className="mt-1 text-sm text-gray-600">{message}</div>
            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className={
              destructive
                ? 'rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50'
                : 'rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50'
            }
          >
            {pending ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}