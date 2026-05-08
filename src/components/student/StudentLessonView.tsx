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
import {
  type LessonDetail,
  getSignedAttachmentUrl,
} from '@/lib/actions/modules';

interface StudentLessonViewProps {
  lesson: LessonDetail;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StudentLessonView({ lesson }: StudentLessonViewProps) {
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDownload(attachmentId: string) {
    setError(null);
    setPendingId(attachmentId);
    startTransition(async () => {
      try {
        const url = await getSignedAttachmentUrl(attachmentId);
        window.open(url, '_blank', 'noopener,noreferrer');
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
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 text-red-400 hover:text-red-600"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        {lesson.body.trim() ? (
          <MarkdownContent body={lesson.body} />
        ) : (
          <p className="text-sm italic text-gray-400">
            This lesson has no content yet.
          </p>
        )}
      </section>

      {lesson.attachments.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-gray-500">
            <Paperclip className="h-3.5 w-3.5" />
            Attachments
          </h2>
          <ul className="space-y-1">
            {lesson.attachments.map((a) => {
              const isPending = pendingId === a.id;
              return (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50/50 px-3 py-2"
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