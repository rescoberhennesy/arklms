'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload, FileText, Trash2, Download, Paperclip } from 'lucide-react';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import {
  createActivityAttachment,
  deleteActivityAttachment,
  getSignedActivityAttachmentUrl,
} from '@/lib/actions/activities';
import type { ActivityAttachment } from '@/lib/types/activities';
import { createClient } from '@/lib/supabase/client';

interface ActivityAttachmentsPanelProps {
  activityId: string;
  classId: string;
  initialAttachments: ActivityAttachment[];
  canEdit: boolean;
}

const MAX_BYTES = 25 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

// Stable signature for prop-sync — same pattern as ModulesTab/ActivityEditor
function attachmentsSignature(list: ActivityAttachment[]): string {
  return list.map((a) => `${a.id}:${a.uploadedAt}`).join('|');
}

export default function ActivityAttachmentsPanel({
  activityId,
  classId,
  initialAttachments,
  canEdit,
}: ActivityAttachmentsPanelProps) {
  const router = useRouter();
  const [attachments, setAttachments] = useState<ActivityAttachment[]>(initialAttachments);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, startUploadTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<ActivityAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Prop-sync: when server re-fetches and hands us a fresh initialAttachments,
  // adopt it. Skip if the signature hasn't changed (avoids infinite loops).
  const sig = attachmentsSignature(initialAttachments);
  const lastSyncedSig = useRef(sig);
  useEffect(() => {
    if (sig === lastSyncedSig.current) return;
    lastSyncedSig.current = sig;
    setAttachments(initialAttachments);
  }, [sig, initialAttachments]);

  async function handleFiles(files: FileList | null) {
    setError(null);
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        setError(`"${file.name}" is too large (${formatBytes(file.size)}). Max 25 MB.`);
        return;
      }
    }

    startUploadTransition(async () => {
      try {
        const supabase = createClient();
        // Track new rows to add optimistically — gives immediate UI feedback
        // before the server revalidation round-trip completes.
        const newOptimistic: ActivityAttachment[] = [];

        for (const file of Array.from(files)) {
          const filename = sanitizeFilename(file.name);
          const path = `${classId}/${activityId}/${Date.now()}-${filename}`;

          const { error: uploadErr } = await supabase.storage
            .from('activity-attachments')
            .upload(path, file, {
              contentType: file.type || 'application/octet-stream',
              upsert: false,
            });
          if (uploadErr) {
            setError(`Upload failed: ${uploadErr.message}`);
            return;
          }

          const { attachmentId } = await createActivityAttachment({
            activityId,
            attachment: {
              path,
              name: file.name,
              size: file.size,
              mimeType: file.type || 'application/octet-stream',
            },
          });

          // Optimistic: add to local state immediately. The next
          // router.refresh() will resync with the server's authoritative
          // list via the prop-sync useEffect above.
          newOptimistic.push({
            id: attachmentId,
            activityId,
            filePath: path,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || 'application/octet-stream',
            uploadedBy: '', // populated on server-side refetch
            uploadedAt: new Date().toISOString(),
          });
        }

        if (newOptimistic.length > 0) {
          setAttachments((prev) => [...prev, ...newOptimistic]);
        }

        router.refresh();
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed.');
      }
    });
  }

  async function handleDownload(att: ActivityAttachment) {
    setError(null);
    try {
      const url = await getSignedActivityAttachmentUrl(att.filePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open file.');
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    setError(null);
    const toDelete = confirmDelete;
    // Optimistic remove
    setAttachments((prev) => prev.filter((a) => a.id !== toDelete.id));
    try {
      await deleteActivityAttachment(toDelete.id);
      router.refresh();
    } catch (e) {
      // Rollback on failure
      setAttachments((prev) =>
        [...prev, toDelete].sort((a, b) =>
          a.uploadedAt.localeCompare(b.uploadedAt),
        ),
      );
      setError(e instanceof Error ? e.message : 'Failed to delete.');
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            <Paperclip className="-mt-0.5 mr-1 inline h-3.5 w-3.5" />
            Attachments
          </h2>
          <p className="text-xs text-gray-500">
            Reference files (worksheets, readings, rubrics) students download to complete the assignment.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {attachments.length === 0 ? (
        <p className="mb-3 text-sm italic text-gray-400">No attachments yet.</p>
      ) : (
        <ul className="mb-3 space-y-1">
          {attachments.map((att) => (
            <li
              key={att.id}
              className="flex items-center gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
            >
              <FileText className="h-4 w-4 flex-shrink-0 text-gray-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-900">{att.fileName}</p>
                <p className="text-xs text-gray-500">
                  {formatBytes(att.fileSize)} · {new Date(att.uploadedAt).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDownload(att)}
                className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                title="Download"
                aria-label="Download attachment"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(att)}
                  disabled={isUploading}
                  className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  title="Delete"
                  aria-label="Delete attachment"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            disabled={isUploading}
            className="hidden"
            id={`activity-att-input-${activityId}`}
          />
          <label
            htmlFor={`activity-att-input-${activityId}`}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 ${
              isUploading ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {isUploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {isUploading ? 'Uploading…' : 'Upload files'}
          </label>
          <p className="mt-1 text-xs text-gray-500">
            Up to 25 MB each. PDFs, Word, Excel, images, and more.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete attachment?"
        message={
          confirmDelete
            ? `"${confirmDelete.fileName}" will be permanently removed from this activity.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleConfirmDelete}
        onClose={() => setConfirmDelete(null)}
      />
    </section>
  );
}