'use client';

import { useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Eye,
  EyeOff,
} from 'lucide-react';
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
  /** Hide the live-preview pane by default. Users can still toggle it on
   *  via the eye icon. Set this for tight inline contexts (comments, etc).
   *  Defaults to false — preview pane is shown. */
  livePreviewDefaultHidden?: boolean;
}

type Mode = 'write' | 'preview';

/**
 * Markdown editor with a formatting toolbar and a live side-by-side
 * preview pane. Controlled component — parent owns `value`.
 *
 * The two-pane Write mode is the main UX win: as soon as a user types
 * **bold**, they see "bold" appear bold on the right. No more mystery
 * asterisks. The dedicated "Preview" tab still exists for users who
 * want the rendered output full-width.
 *
 * The toolbar manipulates the textarea's current selection / cursor:
 *  - Inline marks (bold, italic, strike, code, link) wrap the selection
 *    or insert a placeholder.
 *  - Block marks (headings, lists, quote) prepend the affected lines.
 */
export default function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Type your message... markdown supported.',
  rows = 5,
  helper,
  disabled = false,
  className,
  livePreviewDefaultHidden = false,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<Mode>('write');
  const [showLivePreview, setShowLivePreview] = useState(
    !livePreviewDefaultHidden,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Edit primitives --------------------------------------------------
  //
  // All toolbar buttons go through one of these two helpers so the
  // cursor / selection behavior stays consistent. After mutating the
  // value we schedule focus + selection restore via requestAnimationFrame
  // because React hasn't flushed the new value to the DOM yet on the
  // same tick.

  function wrapSelection(
    before: string,
    after: string = before,
    placeholder = 'text',
  ) {
    const ta = textareaRef.current;
    if (!ta) return;

    const { selectionStart: start, selectionEnd: end } = ta;
    const selected = value.slice(start, end);
    const hasSelection = start !== end;

    const inner = hasSelection ? selected : placeholder;
    const next =
      value.slice(0, start) + before + inner + after + value.slice(end);

    onChange(next);

    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (!t) return;
      t.focus();
      const innerStart = start + before.length;
      const innerEnd = innerStart + inner.length;
      t.setSelectionRange(innerStart, innerEnd);
    });
  }

  function prefixLines(prefix: string, numbered = false) {
    const ta = textareaRef.current;
    if (!ta) return;

    const { selectionStart: start, selectionEnd: end } = ta;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = (() => {
      const nextNl = value.indexOf('\n', end);
      return nextNl === -1 ? value.length : nextNl;
    })();

    const block = value.slice(lineStart, lineEnd);
    const lines = block.split('\n');

    const newBlock = lines
      .map((line, i) => {
        const actualPrefix = numbered ? `${i + 1}. ` : prefix;
        if (!numbered && line.startsWith(actualPrefix)) {
          return line.slice(actualPrefix.length);
        }
        return actualPrefix + line;
      })
      .join('\n');

    const next = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
    onChange(next);

    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(lineStart, lineStart + newBlock.length);
    });
  }

  // --- Toolbar action handlers -----------------------------------------

  function handleBold() {
    wrapSelection('**', '**', 'bold text');
  }
  function handleItalic() {
    wrapSelection('*', '*', 'italic text');
  }
  function handleStrike() {
    wrapSelection('~~', '~~', 'strikethrough');
  }
  function handleCode() {
    wrapSelection('`', '`', 'code');
  }
  function handleLink() {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: start, selectionEnd: end } = ta;
    const selected = value.slice(start, end);
    const text = selected || 'link text';
    const insert = `[${text}](url)`;
    const next = value.slice(0, start) + insert + value.slice(end);
    onChange(next);

    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (!t) return;
      t.focus();
      const urlStart = start + 1 + text.length + 2; // "[" + text + "]("
      const urlEnd = urlStart + 3; // "url"
      t.setSelectionRange(urlStart, urlEnd);
    });
  }
  function handleH2() {
    prefixLines('## ');
  }
  function handleH3() {
    prefixLines('### ');
  }
  function handleBulletList() {
    prefixLines('- ');
  }
  function handleNumberedList() {
    prefixLines('', true);
  }
  function handleQuote() {
    prefixLines('> ');
  }

  return (
    <div className={cn('rounded-lg border border-gray-300 bg-white', className)}>
      {/* Header: tabs on left, toolbar + live-preview toggle on right */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-2 py-1">
        <div className="flex items-center gap-1">
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

        {mode === 'write' && (
          <div
            className="flex flex-wrap items-center gap-0.5"
            role="toolbar"
            aria-label="Formatting"
          >
            <ToolbarButton
              onClick={handleBold}
              disabled={disabled}
              title="Bold  ( **text** )"
              ariaLabel="Bold"
            >
              <Bold className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={handleItalic}
              disabled={disabled}
              title="Italic  ( *text* )"
              ariaLabel="Italic"
            >
              <Italic className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={handleStrike}
              disabled={disabled}
              title="Strikethrough  ( ~~text~~ )"
              ariaLabel="Strikethrough"
            >
              <Strikethrough className="h-3.5 w-3.5" />
            </ToolbarButton>

            <ToolbarDivider />

            <ToolbarButton
              onClick={handleH2}
              disabled={disabled}
              title="Heading 2  ( ## )"
              ariaLabel="Heading 2"
            >
              <Heading2 className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={handleH3}
              disabled={disabled}
              title="Heading 3  ( ### )"
              ariaLabel="Heading 3"
            >
              <Heading3 className="h-3.5 w-3.5" />
            </ToolbarButton>

            <ToolbarDivider />

            <ToolbarButton
              onClick={handleBulletList}
              disabled={disabled}
              title="Bullet list  ( - item )"
              ariaLabel="Bullet list"
            >
              <List className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={handleNumberedList}
              disabled={disabled}
              title="Numbered list  ( 1. item )"
              ariaLabel="Numbered list"
            >
              <ListOrdered className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={handleQuote}
              disabled={disabled}
              title="Quote  ( > )"
              ariaLabel="Quote"
            >
              <Quote className="h-3.5 w-3.5" />
            </ToolbarButton>

            <ToolbarDivider />

            <ToolbarButton
              onClick={handleCode}
              disabled={disabled}
              title="Inline code  ( `code` )"
              ariaLabel="Inline code"
            >
              <Code className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={handleLink}
              disabled={disabled}
              title="Link  ( [text](url) )"
              ariaLabel="Link"
            >
              <LinkIcon className="h-3.5 w-3.5" />
            </ToolbarButton>

            <ToolbarDivider />

            {/* Live preview pane toggle. Hidden in Preview mode since the
                full pane already shows the rendered output. */}
            <ToolbarButton
              onClick={() => setShowLivePreview((v) => !v)}
              disabled={disabled}
              title={
                showLivePreview ? 'Hide live preview' : 'Show live preview'
              }
              ariaLabel={
                showLivePreview ? 'Hide live preview' : 'Show live preview'
              }
            >
              {showLivePreview ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </ToolbarButton>
          </div>
        )}
      </div>

      {/* Main body */}
      {mode === 'write' ? (
        <div
          className={cn(
            'flex',
            // Stack vertically on narrow viewports so the textarea doesn't
            // get squashed. Two columns from md (768px) up.
            showLivePreview ? 'flex-col md:flex-row' : 'flex-col',
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            disabled={disabled}
            className={cn(
              'resize-y border-0 bg-transparent px-3 py-2 text-sm text-gray-800',
              'placeholder:text-gray-400 focus:outline-none focus:ring-0 disabled:opacity-60',
              showLivePreview
                ? 'w-full md:w-1/2 md:border-r md:border-gray-200'
                : 'w-full rounded-b-lg',
            )}
          />
          {showLivePreview && (
            <div
              className={cn(
                'w-full md:w-1/2 overflow-y-auto bg-gray-50/50 px-3 py-2',
                // Match approximate height to textarea rows. Each row ~24px
                // + 16px vertical padding to align with the textarea.
                'min-h-[' + (rows * 24 + 16) + 'px]',
                // Border above on small screens (stacked); none on md+ where
                // it sits beside the textarea (left border handled above).
                'border-t border-gray-200 md:border-t-0',
              )}
              aria-label="Live preview"
            >
              {value.trim() ? (
                <MarkdownContent body={value} />
              ) : (
                <p className="text-sm italic text-gray-400">
                  Preview appears here as you type.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="px-3 py-2">
          {value.trim() ? (
            <MarkdownContent body={value} />
          ) : (
            <p className="py-2 text-sm italic text-gray-400">
              Nothing to preview.
            </p>
          )}
        </div>
      )}

      {/* Footer: optional parent-supplied helper (submit hints, etc.) */}
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

function ToolbarButton({
  onClick,
  disabled,
  title,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // onMouseDown + preventDefault keeps the textarea focused so
      // selectionStart/selectionEnd stay valid when the action runs.
      // Without this, clicking the button steals focus and the
      // selection collapses before we can read it.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded text-gray-500 transition',
        'hover:bg-gray-100 hover:text-gray-800',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-red-500',
        disabled &&
          'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-gray-500',
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return (
    <span className="mx-0.5 h-4 w-px bg-gray-200" aria-hidden="true" />
  );
}