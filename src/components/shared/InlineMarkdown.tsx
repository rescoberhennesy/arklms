// src/components/shared/InlineMarkdown.tsx
//
// Tiny, dependency-free renderer for short inline Markdown (flashcards etc.).
// Supports: **bold**, *italic*, `code`, line breaks, and "- " bullet lines.
// Renders React nodes only (no innerHTML), so it's safe for AI/user text.

import { Fragment, type ReactNode } from 'react';

// Order matters: code first, then bold, then italic.
const TOKEN = /(`[^`]+?`|\*\*[^*]+?\*\*|\*[^*\s](?:[^*]*?[^*\s])?\*)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // split() with a capture group puts matched tokens at odd indices.
  return text.split(TOKEN).map((part, i) => {
    if (!part) return null;
    const key = `${keyPrefix}-${i}`;
    if (i % 2 === 0) return <Fragment key={key}>{part}</Fragment>;

    if (part.startsWith('`')) {
      return (
        <code
          key={key}
          className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.9em] text-gray-800"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**')) {
      return (
        <strong key={key} className="font-semibold">
          {renderInline(part.slice(2, -2), key)}
        </strong>
      );
    }
    return <em key={key}>{renderInline(part.slice(1, -1), key)}</em>;
  });
}

export default function InlineMarkdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n');
  return (
    <span className={className}>
      {lines.map((line, i) => {
        const bullet = /^\s*[-*]\s+/.test(line);
        const content = bullet ? line.replace(/^\s*[-*]\s+/, '') : line;
        return (
          <Fragment key={i}>
            {i > 0 && <br />}
            {bullet && '• '}
            {renderInline(content, `l${i}`)}
          </Fragment>
        );
      })}
    </span>
  );
}