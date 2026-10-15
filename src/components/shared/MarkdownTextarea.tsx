// src/components/shared/MarkdownTextarea.tsx
//
// Small WYSIWYG field (Tiptap) for short text like flashcards.
// Shows real bold/italic/code while editing; reads and writes Markdown
// (**bold**, *italic*, `code`, line breaks) so storage stays the same and
// <InlineMarkdown> can render it elsewhere.
// Shortcuts (built into Tiptap): Ctrl/Cmd+B, Ctrl/Cmd+I, Ctrl/Cmd+E.

'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useEditor, EditorContent, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, Code } from 'lucide-react';

// ---------------------------------------------------------------------------
// Markdown <-> editor conversion (limited inline subset)
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMdToHtml(line: string): string {
  // Split out `code` first so asterisks inside code are left alone.
  return line
    .split(/(`[^`]+?`)/g)
    .map((part, i) => {
      if (i % 2 === 1) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      return escapeHtml(part)
        .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\s](?:[^*]*?[^*\s])?)\*/g, '<em>$1</em>');
    })
    .join('');
}

function markdownToHtml(md: string): string {
  const text = (md ?? '').replace(/\r\n/g, '\n');
  if (!text.trim()) return '<p></p>';
  return `<p>${text.split('\n').map(inlineMdToHtml).join('<br>')}</p>`;
}

function inlineNodeToMd(node: JSONContent): string {
  if (node.type === 'hardBreak') return '\n';
  if (node.type !== 'text') return '';
  const text = node.text ?? '';
  const marks = new Set((node.marks ?? []).map((m) => m.type));
  if (marks.has('code')) return '`' + text + '`';

  // Keep surrounding spaces outside the markers ("** word**" is invalid MD).
  const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const [lead, core, trail] = match ? [match[1], match[2], match[3]] : ['', text, ''];
  if (!core) return text;
  let out = core;
  if (marks.has('italic')) out = `*${out}*`;
  if (marks.has('bold')) out = `**${out}**`;
  return lead + out + trail;
}

function docToMarkdown(doc: JSONContent): string {
  return (doc.content ?? [])
    .map((block) => (block.content ?? []).map(inlineNodeToMd).join(''))
    .join('\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  autoFocus?: boolean;
  maxLength?: number; // kept for API compatibility (not enforced)
  className?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  'aria-label'?: string;
};

export default function MarkdownTextarea({
  value,
  onChange,
  placeholder,
  disabled,
  rows = 2,
  autoFocus,
  className = '',
  onKeyDown,
  'aria-label': ariaLabel,
}: Props) {
  const lastEmitted = useRef(value);
  const syncing = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Forces a re-render so toolbar active states and placeholder stay in sync.
  const [, setTick] = useState(0);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    autofocus: autoFocus ? 'end' : false,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
      }),
    ],
    content: markdownToHtml(value),
    editorProps: {
      attributes: {
        class:
          'px-3 py-2 text-sm text-gray-900 outline-none focus:outline-none [&_p]:m-0 [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]',
        style: `min-height: ${Math.max(1, rows) * 1.5 + 1}rem`,
        'aria-label': ariaLabel ?? placeholder ?? 'Text',
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor }) => {
      setTick((t) => t + 1);
      if (syncing.current) return;
      const md = docToMarkdown(editor.getJSON());
      lastEmitted.current = md;
      onChangeRef.current(md);
    },
    onSelectionUpdate: () => setTick((t) => t + 1),
    onTransaction: () => setTick((t) => t + 1),
  });

  // External value changes (e.g. form reset to '') → update the editor.
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmitted.current) return;
    syncing.current = true;
    editor.commands.setContent(markdownToHtml(value));
    syncing.current = false;
    lastEmitted.current = value;
    setTick((t) => t + 1);
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  const buttons = [
    {
      key: 'bold',
      Icon: Bold,
      label: 'Bold (Ctrl+B)',
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      key: 'italic',
      Icon: Italic,
      label: 'Italic (Ctrl+I)',
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      key: 'code',
      Icon: Code,
      label: 'Code (Ctrl+E)',
      run: () => editor?.chain().focus().toggleCode().run(),
    },
  ];

  const isEmpty = !editor || editor.isEmpty;

  return (
    <div className={className}>
      <div
        className={`overflow-hidden rounded-md border border-gray-200 bg-white focus-within:border-purple-500 ${
          disabled ? 'opacity-60' : ''
        }`}
      >
        <div className="flex items-center gap-0.5 border-b border-gray-100 px-1.5 py-1">
          {buttons.map(({ key, Icon, label, run }) => {
            const active = editor?.isActive(key) ?? false;
            return (
              <button
                key={key}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={active}
                disabled={disabled || !editor}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep selection in the editor
                  run();
                }}
                className={`rounded p-1 disabled:cursor-not-allowed ${
                  active
                    ? 'bg-purple-100 text-purple-700'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>

        <div className="relative" onKeyDown={onKeyDown}>
          {isEmpty && placeholder && (
            <span className="pointer-events-none absolute left-3 top-2 text-sm text-gray-400">
              {placeholder}
            </span>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}