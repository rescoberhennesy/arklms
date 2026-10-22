'use client';

import { useState, useTransition } from 'react';
import {
  Download,
  FileText,
  Loader2,
  Paperclip,
  X,
} from 'lucide-react';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import LessonAttachmentPreview from '@/components/dashboard/LessonAttachmentPreview';
import {
  type LessonDetail,
  getAttachmentSignedUrl,
} from '@/lib/actions/modules';

interface StudentLessonViewProps {
  lesson: LessonDetail;
  /** True when the lesson has at least one study-ready flashcard deck. */
  hasFlashcards?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StudentLessonView({
  lesson,
  hasFlashcards = false,
}: StudentLessonViewProps) {
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const hasBody = lesson.body.trim().length > 0;
  const hasAttachments = lesson.attachments.length > 0;
  const isEmpty = !hasBody && !hasAttachments && !hasFlashcards;

  function handleDownload(attachmentId: string) {
    setError(null);
    setPendingId(attachmentId);
    startTransition(async () => {
      try {
        // Short-lived signed link straight to Supabase Storage. The server
        // marks it as a download, so the browser saves it with its real name.
        const { url } = await getAttachmentSignedUrl(attachmentId, { download: true });
        const link = document.createElement('a');
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Download failed.');
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{lesson.title}</h1>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Text content — only when the teacher wrote something */}
      {hasBody && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <MarkdownContent body={lesson.body} />
        </section>
      )}

      {/* Truly empty lesson: no text, no files, no flashcards */}
      {isEmpty && (
        <section className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-sm text-gray-500">This lesson has no content yet.</p>
        </section>
      )}

      {hasAttachments && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-gray-500">
            <Paperclip className="h-3.5 w-3.5" />
            Attachments
          </h2>
          <ul className="space-y-2">
            {lesson.attachments.map((a) => {
              const isPending = pendingId === a.id;
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-gray-100 bg-gray-50/50 px-3 py-2"
                >
                  <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-800">
                      {a.file_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(a.file_size)}
                    </p>
                  </div>

                  <LessonAttachmentPreview
                    attachmentId={a.id}
                    fileName={a.file_name}
                    mimeType={a.mime_type ?? null}
                  />

                  <button
                    type="button"
                    onClick={() => handleDownload(a.id)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Download
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}