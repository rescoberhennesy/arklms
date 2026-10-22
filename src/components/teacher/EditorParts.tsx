'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  Save,
  Trash2,
} from 'lucide-react';

export type FinishAction = 'draft' | 'publish' | 'save';

export const editorInputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10 disabled:opacity-60';
export const editorLabelClass = 'mb-1 block text-xs font-semibold text-zinc-700';
export const editorCheckboxClass =
  'mt-0.5 h-4 w-4 rounded border-zinc-300 text-red-600 focus:ring-red-500';

// ---------------------------------------------------------------------------
// [Save as draft] or [Publish]  ⋯   /   [Unpublish] or [Save changes]  ⋯
// ---------------------------------------------------------------------------

export function HeaderActions({
  published,
  busy,
  finishing,
  onFinish,
  onUnpublish,
  onDelete,
  deleteLabel,
}: {
  published: boolean;
  busy: boolean;
  finishing: FinishAction | null;
  onFinish: (action: FinishAction) => void;
  onUnpublish: () => void;
  onDelete: () => void;
  deleteLabel: string;
}) {
  const secondary =
    'inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60';
  const primary =
    'inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-red-600 px-4 text-sm font-bold text-white shadow-[0_6px_16px_rgba(220,38,38,0.22)] transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60';
  const spin = <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {published ? (
        <>
          <button type="button" onClick={onUnpublish} disabled={busy} className={secondary}>
            <EyeOff className="h-4 w-4" />
            Unpublish
          </button>
          <span className="text-xs text-zinc-400">or</span>
          <button type="button" onClick={() => onFinish('save')} disabled={busy} className={primary}>
            {finishing === 'save' ? spin : <Save className="h-4 w-4" />}
            Save changes
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => onFinish('draft')} disabled={busy} className={secondary}>
            {finishing === 'draft' ? spin : <Save className="h-4 w-4" />}
            Save as draft
          </button>
          <span className="text-xs text-zinc-400">or</span>
          <button type="button" onClick={() => onFinish('publish')} disabled={busy} className={primary}>
            {finishing === 'publish' ? spin : <Eye className="h-4 w-4" />}
            Publish
          </button>
        </>
      )}
      <MoreMenu onDelete={onDelete} deleteLabel={deleteLabel} disabled={busy} />
    </div>
  );
}

function MoreMenu({
  onDelete,
  deleteLabel,
  disabled,
}: {
  onDelete: () => void;
  deleteLabel: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-800 disabled:opacity-50"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-20 w-48 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            {deleteLabel}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit / Submissions tabs
// ---------------------------------------------------------------------------

export function EditorTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; count?: number }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-6 border-b border-zinc-200">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.key)}
            className={`-mb-px inline-flex items-center border-b-2 px-1 pb-2.5 text-sm transition ${
              isActive
                ? 'border-red-600 font-bold text-red-700'
                : 'border-transparent font-semibold text-zinc-500 hover:text-zinc-900'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                  isActive ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-500'
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings group — always open, so no setting is hidden from teachers.
// (Kept the old name/props so the editors don't need to change; `summary`
// and `defaultOpen` are now ignored.)
// ---------------------------------------------------------------------------

export function SettingsDisclosure({
  title,
  children,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <div className="space-y-3 border-t border-zinc-100 py-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{title}</p>
      {children}
    </div>
  );
}