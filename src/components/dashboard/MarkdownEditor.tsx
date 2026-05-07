'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import MarkdownContent from './MarkdownContent';

interface MarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  /** Optional helper text shown below the editor (e.g. submit hints). */
  helper?: React.ReactNode;
  /** When true, both textarea and tabs are disabled (e.g. while submitting). */
  disabled?: boolean;
  className?: string;
}

type Mode = 'write' | 'preview';

/**
 * Markdown editor with Write/Preview tabs. Controlled component -- parent
 * owns `value` and updates on `onChange`. Submit affordance is the parent's
 * responsibility (different contexts use different submit UIs).
 */
export default function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Type your message... markdown supported.',
  rows = 5,
  helper,
  disabled = false,
  className,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<Mode>('write');

  return (
    <div className={cn('rounded-lg border border-gray-300 bg-white', className)}>
      <div className="flex items-center gap-1 border-b border-gray-200 px-2 py-1">
        <TabButton
          active={mode === 'write'}
          disabled={disabled}
          onClick={() => setMode('write')}
        >
          Write
        </TabButton>
        <TabButton
          active={mode === 'preview'}
          disabled={disabled}
          onClick={() => setMode('preview')}
        >
          Preview
        </TabButton>
      </div>

      {mode === 'write' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className="w-full resize-y rounded-b-lg border-0 bg-transparent px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-0 disabled:opacity-60"
        />
      ) : (
        <div className="px-3 py-2">
          {value.trim() ? (
            <MarkdownContent body={value} />
          ) : (
            <p className="py-2 text-sm italic text-gray-400">Nothing to preview.</p>
          )}
        </div>
      )}

      {helper && (
        <div className="border-t border-gray-100 px-3 py-1.5 text-xs text-gray-500">
          {helper}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded px-2.5 py-1 text-xs font-medium transition',
        active
          ? 'bg-gray-100 text-gray-900'
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      {children}
    </button>
  );
}
