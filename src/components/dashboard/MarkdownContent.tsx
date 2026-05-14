'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { cn } from '@/lib/utils/cn';

// Extended sanitize schema: defaultSchema strips <details>/<summary>, which
// we use for collapse/reveal blocks (e.g. AI-generated reviewer practice
// answers). Both tags are inert (no scripting); explicitly allow them.
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary'],
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    details: [...((defaultSchema.attributes ?? {}).details ?? []), 'open'],
  },
};

interface MarkdownContentProps {
  body: string;
  className?: string;
}

/**
 * Read-only markdown renderer. Single source of truth for how rendered
 * markdown looks across the app -- announcements, comments, module
 * descriptions, assignment instructions.
 *
 * Sanitization is applied via rehype-sanitize's default schema, which
 * permits safe HTML (headings, lists, links, code, blockquotes, tables)
 * and strips dangerous tags (script, iframe, event handlers).
 *
 * Links open in a new tab with rel=noopener,noreferrer to prevent the
 * tab-napping attack via window.opener.
 */
export default function MarkdownContent({ body, className }: MarkdownContentProps) {
  return (
    <div className={cn('text-sm text-gray-800', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          p: ({ children }) => (
            <p className="my-2 first:mt-0 last:mb-0 leading-relaxed">{children}</p>
          ),
          h1: ({ children }) => (
            <h1 className="mt-3 mb-2 text-base font-semibold first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-3 mb-1.5 text-sm font-semibold first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2 mb-1 text-sm font-semibold first:mt-0">{children}</h3>
          ),
          ul: ({ children }) => (
            <ul className="my-2 ml-5 list-disc space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-5 list-decimal space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-gray-300 pl-3 text-gray-600">
              {children}
            </blockquote>
          ),
          code: ({ children, className: codeClass }) => {
            const isInline = !codeClass;
            if (isInline) {
              return (
                <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-800">
                  {children}
                </code>
              );
            }
            return (
              <code className="block whitespace-pre-wrap font-mono text-xs text-gray-800">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-lg bg-gray-100 p-3">
              {children}
            </pre>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-600 underline underline-offset-2 hover:text-red-700"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-3 border-gray-200" />,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-200 px-2 py-1">{children}</td>
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
