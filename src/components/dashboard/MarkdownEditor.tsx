'use client';

import { useEffect } from 'react';
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from 'tiptap-markdown';
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
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface MarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  /** Optional helper text shown below the editor (e.g. submit hints). */
  helper?: React.ReactNode;
  /** When true, the editor and toolbar are disabled (e.g. while submitting). */
  disabled?: boolean;
  className?: string;
  /** Kept for compatibility with existing callers. The editor no longer has
   *  a preview pane, so this has no effect. */
  livePreviewDefaultHidden?: boolean;
}

/**
 * Rich-text editor: what you see is what you get. Teachers click B / I /
 * lists etc. and the text is formatted in place — no markdown symbols.
 *
 * Content is still SAVED as Markdown (via tiptap-markdown), so everything
 * already in the database and every <MarkdownContent> renderer keeps
 * working unchanged. Controlled component — the parent owns `value`.
 */
export default function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Type your message...',
  rows = 5,
  helper,
  disabled = false,
  className,
}: MarkdownEditorProps) {
  const editor = useEditor({
    // Required with Next.js server rendering to avoid hydration mismatches.
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      Placeholder.configure({ placeholder }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'rte-content focus:outline-none',
        style: `min-height: ${rows * 24}px`,
      },
    },
    onUpdate: ({ editor }) => {
      onChange(getMarkdown(editor));
    },
  });

  // Keep the editor in sync when the parent changes `value` from outside
  // (e.g. clears it after posting, or resets it when an edit is cancelled).
  useEffect(() => {
    if (!editor) return;
    if (value !== getMarkdown(editor)) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  // Which formats are active at the cursor, so toolbar buttons can light up.
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            strike: e.isActive('strike'),
            h2: e.isActive('heading', { level: 2 }),
            h3: e.isActive('heading', { level: 3 }),
            bullet: e.isActive('bulletList'),
            ordered: e.isActive('orderedList'),
            quote: e.isActive('blockquote'),
            code: e.isActive('code'),
            link: e.isActive('link'),
          }
        : null,
  });

  function handleLink() {
    if (!editor) return;
    if (editor.isActive('link')) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const url = window.prompt('Paste the link (URL):', 'https://');
    if (!url || url === 'https://') return;
    if (editor.state.selection.empty) {
      // No text selected: insert the URL itself as a link.
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  }

  const off = disabled || !editor;

  return (
    <div className={cn('rounded-lg border border-gray-300 bg-white', className)}>
      <div
        className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 px-2 py-1"
        role="toolbar"
        aria-label="Formatting"
      >
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={active?.bold}
          disabled={off}
          title="Bold (Ctrl+B)"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={active?.italic}
          disabled={off}
          title="Italic (Ctrl+I)"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          active={active?.strike}
          disabled={off}
          title="Strikethrough"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          active={active?.h2}
          disabled={off}
          title="Heading"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          active={active?.h3}
          disabled={off}
          title="Subheading"
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={active?.bullet}
          disabled={off}
          title="Bullet list"
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={active?.ordered}
          disabled={off}
          title="Numbered list"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          active={active?.quote}
          disabled={off}
          title="Quote"
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleCode().run()}
          active={active?.code}
          disabled={off}
          title="Inline code"
        >
          <Code className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={handleLink}
          active={active?.link}
          disabled={off}
          title={active?.link ? 'Remove link' : 'Add link'}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      <EditorContent
        editor={editor}
        className={cn(
          'px-3 py-2 text-sm text-gray-800',
          disabled && 'opacity-60',
          !helper && 'rounded-b-lg',
        )}
      />

      {helper && (
        <div className="border-t border-gray-100 px-3 py-1.5 text-xs text-gray-500">
          {helper}
        </div>
      )}
    </div>
  );
}

function getMarkdown(editor: Editor): string {
  // tiptap-markdown stores its serializer on editor.storage.markdown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((editor.storage as any).markdown.getMarkdown() as string) ?? '';
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // Keep focus (and the text selection) inside the editor when clicking.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded transition',
        active
          ? 'bg-red-50 text-red-600'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-red-500',
        disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-gray-500',
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-4 w-px bg-gray-200" aria-hidden="true" />;
}