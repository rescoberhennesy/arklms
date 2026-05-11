'use client';

import { useState } from 'react';
import { FileText, Download, Loader2, Paperclip } from 'lucide-react';
import { getSignedActivityAttachmentUrl } from '@/lib/actions/activities';
import type { ActivityAttachment } from '@/lib/types/activities';

interface StudentActivityAttachmentsListProps {
  attachments: ActivityAttachment[];
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StudentActivityAttachmentsList({
  attachments,
}: StudentActivityAttachmentsListProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(att: ActivityAttachment) {
    setError(null);
    setLoadingId(att.id);
    try {
      const url = await getSignedActivityAttachmentUrl(att.filePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open file.');
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        <Paperclip className="-mt-0.5 mr-1 inline h-3.5 w-3.5" />
        Attached files
      </h2>
      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <ul className="space-y-1">
        {attachments.map((att) => (
          <li
            key={att.id}
            className="flex items-center gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
          >
            <FileText className="h-4 w-4 flex-shrink-0 text-gray-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-gray-900">{att.fileName}</p>
              <p className="text-xs text-gray-500">{formatBytes(att.fileSize)}</p>
            </div>
            <button
              type="button"
              onClick={() => handleDownload(att)}
              disabled={loadingId === att.id}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {loadingId === att.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Download className="h-3 w-3" />
              )}
              Download
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}