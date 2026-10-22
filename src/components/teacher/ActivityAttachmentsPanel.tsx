'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload, FileText, Trash2, Download, Paperclip, Plus } from 'lucide-react';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import {
  createActivityAttachment,
  deleteActivityAttachment,
  getSignedActivityAttachmentUrl,
} from '@/lib/actions/activities';
import type { ActivityAttachment } from '@/lib/types/activities';
import { createClient } from '@/lib/supabase/client';
import { useServerSyncedState } from '@/lib/hooks/useServerSyncedState';
import LessonAttachmentPreview from '@/components/dashboard/LessonAttachmentPreview';

interface ActivityAttachmentsPanelProps {
  activityId: string;
  classId: string;
  initialAttachments: ActivityAttachment[];
  canEdit: boolean;
  /** 'card' = standalone section (default). 'inline' = compact, no card. */
  variant?: 'card' | 'inline';
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

function attachmentsSignature(list: ActivityAttachment[]): string {
  return list.map((a) => `${a.id}:${a.uploadedAt}`).join('|');
}

export default function ActivityAttachmentsPanel({
  activityId,
  classId,
  initialAttachments,
  canEdit,
  variant = 'card',
}: ActivityAttachmentsPanelProps) {
  const router = useRouter();
  const [attachments, setAttachments] = useServerSyncedState(
    initialAttachments,
    attachmentsSignature,
  );
  const [error, setError] = useState<string | null>(null);
  const [isUploading, startUploadTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<ActivityAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = `activity-att-input-${activityId}`;

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

          newOptimistic.push({
            id: attachmentId,
            activityId,
            filePath: path,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || 'application/octet-stream',
            uploadedBy: '',
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
    setAttachments((prev) => prev.filter((a) => a.id !== toDelete.id));
    try {
      await deleteActivityAttachment(toDelete.id);
      router.refresh();
    } catch (e) {
      setAttachments((prev) =>
        [...prev, toDelete].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)),
      );
      setError(e instanceof Error ? e.message : 'Failed to delete.');
    } finally {
      setConfirmDelete(null);
    }
  }

  const fileInput = canEdit ? (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      onChange={(e) => handleFiles(e.target.files)}
      disabled={isUploading}
      className="hidden"
      id={inputId}
    />
  ) : null;

  const errorBox = error ? (
    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      {error}
    </div>
  ) : null;

  const list = (
    <ul className="space-y-1.5">
      {attachments.map((att) => (
        <li
          key={att.id}
          className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
        >
          <FileText className="h-4 w-4 flex-shrink-0 text-zinc-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-zinc-900">{att.fileName}</p>
            <p className="text-xs text-zinc-500">
              {formatBytes(att.fileSize)} · {new Date(att.uploadedAt).toLocaleDateString()}
            </p>
          </div>
          <LessonAttachmentPreview
            attachmentId={att.id}
            fileName={att.fileName}
            mimeType={att.mimeType ?? null}
            getUrl={() => getSignedActivityAttachmentUrl(att.filePath)}
          />
          <button
            type="button"
            onClick={() => handleDownload(att)}
            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
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
              className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              title="Delete"
              aria-label="Delete attachment"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  const confirm = (
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
  );

  // ---------------- Inline (compact) ----------------
  if (variant === 'inline') {
    return (
      <div>
        {fileInput}
        {errorBox}
        {attachments.length === 0 ? (
          canEdit ? (
            <label
              htmlFor={inputId}
              className={`inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-zinc-600 transition hover:text-red-600 ${
                isUploading ? 'pointer-events-none opacity-60' : ''
              }`}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
              {isUploading ? 'Uploading…' : 'Attach file'}
              <span className="font-normal text-zinc-400">· optional, up to 25 MB each</span>
            </label>
          ) : null
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800">
                <Paperclip className="h-4 w-4 text-zinc-500" />
                Attached files
                <span className="font-normal text-zinc-400">({attachments.length})</span>
              </p>
              {canEdit && (
                <label
                  htmlFor={inputId}
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50 ${
                    isUploading ? 'pointer-events-none opacity-60' : ''
                  }`}
                >
                  {isUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  {isUploading ? 'Uploading…' : 'Add file'}
                </label>
              )}
            </div>
            {list}
          </>
        )}
        {confirm}
      </div>
    );
  }

  // ---------------- Card (standalone) ----------------
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          <Paperclip className="-mt-0.5 mr-1 inline h-3.5 w-3.5" />
          Attachments
        </h2>
        <p className="text-xs text-gray-500">
          Reference files (worksheets, readings, rubrics) students download to complete the activity.
        </p>
      </div>

      {errorBox}

      {attachments.length === 0 ? (
        <p className="mb-3 text-sm italic text-gray-400">No attachments yet.</p>
      ) : (
        <div className="mb-3">{list}</div>
      )}

      {canEdit && (
        <div>
          {fileInput}
          <label
            htmlFor={inputId}
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

      {confirm}
    </section>
  );
}