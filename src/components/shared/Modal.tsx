// src/components/shared/Modal.tsx
//
// Reusable centered modal: dimmed backdrop, title bar with close button,
// closes on Escape or backdrop click, locks page scroll while open.

'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Tailwind max-width class, e.g. 'max-w-lg' (default) or 'max-w-2xl'. */
  size?: string;
  /** Prevent closing (e.g. while saving). */
  busy?: boolean;
};

export default function Modal({
  open,
  title,
  onClose,
  children,
  size = 'max-w-lg',
  busy = false,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape to close + lock page scroll
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, busy, onClose]);

  // Focus the first field when opening
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (panelRef.current?.contains(document.activeElement)) return;
      const el = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type=hidden]):not([disabled]), textarea, select',
      );
      el?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={`my-8 w-full ${size} rounded-2xl bg-white shadow-xl`}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}