'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Pencil,
  Save,
  Check,
  Loader2,
  Eye,
  EyeOff,
  X,
  Trash2,
  Download,
  FileText,
  Paperclip,
  Sparkles,
} from 'lucide-react';
import MarkdownEditor from '@/components/dashboard/MarkdownEditor';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import AIReviewerModal from '@/components/teacher/ai/AIReviewerModal';
import AIQualityPanel from '@/components/teacher/ai/AIQualityPanel';
import FlashcardDeckPanel from '@/components/teacher/ai/FlashcardDeckPanel';
import LessonAttachmentPreview from '@/components/dashboard/LessonAttachmentPreview';
import { markAiGenerationPublished } from '@/lib/actions/aiGenerations';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import {
  type LessonDetail,
  type LessonAttachment,
  updateLesson,
  setLessonPublished,
  deleteLesson,
  recordAttachment,
  deleteAttachment,
  getAttachmentSignedUrl,
} from '@/lib/actions/modules';

interface LessonEditorProps {
  lesson: LessonDetail;
  classId: string;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LessonEditor({ lesson, classId }: LessonEditorProps) {
  const router = useRouter();

  // Attachments live inside the Lesson Content card (button in its header,
  // file chips under the editor), so the upload logic is shared via a hook.
  const att = useLessonAttachments({
    lessonId: lesson.id,
    classId,
    moduleId: lesson.module_id,
  });

  // Title state
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(lesson.title);

  // Body state
  const [body, setBody] = useState(lesson.body);
  const [savedBody, setSavedBody] = useState(lesson.body);
  const isDirty = body !== savedBody;

  // Async state
  const [isSaving, startSaving] = useTransition();
  const [isTogglingPublish, startTogglingPublish] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI reviewer state
  const [aiReviewerOpen, setAiReviewerOpen] = useState(false);
  const [pendingAiGenerationId, setPendingAiGenerationId] = useState<string | null>(null);

  function handleSaveTitle() {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === lesson.title) {
      setTitleDraft(lesson.title);
      setTitleEditing(false);
      return;
    }
    startSaving(async () => {
      try {
        await updateLesson(lesson.id, { title: trimmed });
        setTitleEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save title.');
        setTitleDraft(lesson.title);
        setTitleEditing(false);
      }
    });
  }

  function handleSaveBody() {
    setError(null);
    const generationId = pendingAiGenerationId;
    const savedBodyToPublish = body;
    startSaving(async () => {
      try {
        await updateLesson(lesson.id, { body });
        setSavedBody(body);
        if (generationId) {
          // Best-effort: never throws.
          await markAiGenerationPublished(generationId, {
            body: savedBodyToPublish,
          });
          setPendingAiGenerationId(null);
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save.');
      }
    });
  }

  // Called by the reviewer modal on accept. Never overwrites: the reviewer
  // is ADDED to the end of the lesson under its own named heading, so
  // students can tell it apart from the lesson itself.
  function handleAiAccept(markdown: string, generationId: string | null, title: string) {
    // Demote the AI's own top headings so they sit under the "Reviewer" heading.
    const content = markdown.trim().replace(/^#{1,2}\s+/gm, '### ');
    const section = `## 📝 Reviewer: ${title.trim() || 'Reviewer'}\n\n${content}`;
    setBody((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${section}` : section));
    setPendingAiGenerationId(generationId);
    setError(null);
  }

  function handleTogglePublish() {
    // Confirm before unpublishing (loses student access)
    if (lesson.published) {
      setConfirmUnpublish(true);
      return;
    }
    doTogglePublish(true);
  }

  function doTogglePublish(next: boolean) {
    setError(null);
    startTogglingPublish(async () => {
      try {
        await setLessonPublished(lesson.id, next);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to change publish state.');
      }
    });
  }

  async function handleDelete() {
    await deleteLesson(lesson.id);
    router.push(`/teacher/classes/${classId}?tab=modules`);
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Title bar */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {titleEditing ? (
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle();
                if (e.key === 'Escape') {
                  setTitleDraft(lesson.title);
                  setTitleEditing(false);
                }
              }}
              autoFocus
              disabled={isSaving}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-2xl font-bold text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
            />
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{lesson.title}</h1>
              <button
                type="button"
                onClick={() => setTitleEditing(true)}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Rename"
                title="Rename"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {lesson.published ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
              <Eye className="h-3.5 w-3.5" />
              Published
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              <EyeOff className="h-3.5 w-3.5" />
              Draft
            </span>
          )}
          <button
            type="button"
            onClick={handleTogglePublish}
            disabled={isTogglingPublish}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
              lesson.published
                ? 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            {isTogglingPublish && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {lesson.published ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Body editor + attachments */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Lesson content
          </h2>
          <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
            <input
              ref={att.inputRef}
              type="file"
              multiple
              onChange={att.handleFilesSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={att.openPicker}
              disabled={att.uploading}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              title="Attach PDFs, slides, documents or images to this lesson"
            >
              {att.uploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Paperclip className="h-3 w-3" />
              )}
              {att.uploading ? 'Uploading…' : 'Attach file'}
            </button>
            <div className="group relative">
              <button
                type="button"
                onClick={() => setAiReviewerOpen(true)}
                disabled={isSaving}
                aria-describedby="generate-from-files-tip"
                className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Sparkles className="h-3 w-3" />
                Generate from files
              </button>
              <div
                id="generate-from-files-tip"
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-72 rounded-lg bg-gray-900 px-3 py-2.5 text-left text-xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <p className="font-semibold">Generate a reviewer or summary with AI</p>
                <p className="mt-1 text-gray-300">
                  Upload a PDF or Word file and AI will write it for you.
                  You can edit it before saving.
                </p>
                <span className="absolute -top-1 right-6 h-2 w-2 rotate-45 bg-gray-900" />
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveBody}
              disabled={isSaving || !isDirty}
              title={isDirty ? 'Save your changes' : 'All changes saved'}
              className={`inline-flex min-w-[84px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                isSaving
                  ? 'cursor-wait bg-red-600 text-white opacity-80'
                  : isDirty
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'cursor-default border border-gray-200 bg-gray-50 text-gray-500'
              }`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving…
                </>
              ) : isDirty ? (
                <>
                  <Save className="h-3 w-3" />
                  Save
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" />
                  Saved
                </>
              )}
            </button>
          </div>
        </div>
        <MarkdownEditor
          value={body}
          onChange={setBody}
          placeholder="Write your lesson content here."
          rows={12}
          disabled={isSaving}
        />

        <AttachmentStrip attachments={lesson.attachments} att={att} />
      </section>

      {/* AI quality analysis — read-only diagnostic, never mutates the lesson */}
      <AIQualityPanel lessonId={lesson.id} />
      <FlashcardDeckPanel lessonId={lesson.id} />

      {/* Danger zone */}
      <section className="rounded-xl border border-red-200 bg-red-50/30 p-4">
        <h2 className="text-sm font-semibold text-red-900">Danger zone</h2>
        <p className="mt-1 text-xs text-red-700">
          Deleting this lesson is permanent and removes all attachments.
        </p>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete lesson
        </button>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this lesson?"
        message={`"${lesson.title}" and all its attachments will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />

      <ConfirmDialog
        open={confirmUnpublish}
        title="Unpublish this lesson?"
        message="Students will lose access to this lesson and its attachments. You can republish it later."
        confirmLabel="Unpublish"
        onConfirm={async () => doTogglePublish(false)}
        onClose={() => setConfirmUnpublish(false)}
      />

      <AIReviewerModal
        open={aiReviewerOpen}
        classId={classId}
        onClose={() => setAiReviewerOpen(false)}
        onAccept={handleAiAccept}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attachments: upload logic (hook) + the file chips shown under the editor
// ---------------------------------------------------------------------------

function useLessonAttachments({
  lessonId,
  classId,
  moduleId,
}: {
  lessonId: string;
  classId: string;
  moduleId: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function openPicker() {
    inputRef.current?.click();
  }

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // reset so the same file can be re-selected after an error
    if (files.length === 0) return;

    setUploading(true);
    setUploadError(null);
    const problems: string[] = [];
    let uploadedAny = false;

    try {
      const supabase = createBrowserClient();
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          problems.push(`${file.name} is too large (${formatFileSize(file.size)}). Max 25 MB.`);
          continue;
        }
        try {
          // Path: <class_id>/<module_id>/<lesson_id>/<timestamp>-<safe_name>
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const filePath = `${classId}/${moduleId}/${lessonId}/${Date.now()}-${safeName}`;

          const { error: uploadErr } = await supabase.storage
            .from('lesson-attachments')
            .upload(filePath, file, { cacheControl: '3600', upsert: false });
          if (uploadErr) throw new Error(uploadErr.message);

          await recordAttachment({
            lessonId,
            filePath,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || null,
          });
          uploadedAny = true;
        } catch (err) {
          problems.push(`${file.name}: ${err instanceof Error ? err.message : 'upload failed.'}`);
        }
      }
    } finally {
      setUploading(false);
      if (problems.length > 0) setUploadError(problems.join(' '));
      if (uploadedAny) router.refresh();
    }
  }

  function handleDownload(attachmentId: string) {
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
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Download failed.');
      }
    });
  }

  async function removeAttachment(attachmentId: string) {
    await deleteAttachment(attachmentId);
    router.refresh();
  }

  return {
    inputRef,
    uploading,
    uploadError,
    clearError: () => setUploadError(null),
    openPicker,
    handleFilesSelected,
    handleDownload,
    removeAttachment,
  };
}

type LessonAttachmentsApi = ReturnType<typeof useLessonAttachments>;

function AttachmentStrip({
  attachments,
  att,
}: {
  attachments: LessonAttachment[];
  att: LessonAttachmentsApi;
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const targetForDelete = attachments.find((a) => a.id === confirmDeleteId);

  return (
    <div className="mt-3 space-y-2">
      {att.uploadError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{att.uploadError}</span>
          <button
            type="button"
            onClick={att.clearError}
            className="text-red-400 hover:text-red-600"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {attachments.length === 0 ? (
        <button
          type="button"
          onClick={att.openPicker}
          disabled={att.uploading}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-xs text-gray-500 transition hover:border-red-300 hover:text-red-600 disabled:opacity-60"
        >
          <Paperclip className="h-3.5 w-3.5" />
          No files attached. Click to attach PDFs, slides, documents or images for this lesson.
        </button>
      ) : (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <Paperclip className="h-3.5 w-3.5" />
            Attached files ({attachments.length})
          </p>
          <ul className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <li
                key={a.id}
                className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-3 pr-1.5"
              >
                <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-800" title={a.file_name}>
                    {a.file_name}
                  </p>
                  <p className="text-xs text-gray-500">{formatFileSize(a.file_size)}</p>
                </div>

                {/* Preview lets the teacher confirm the right file was uploaded.
                    The component hides itself for unsupported types. */}
                <LessonAttachmentPreview
                  attachmentId={a.id}
                  fileName={a.file_name}
                  mimeType={a.mime_type ?? null}
                />

                <button
                  type="button"
                  onClick={() => att.handleDownload(a.id)}
                  className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                  aria-label={`Download ${a.file_name}`}
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(a.id)}
                  className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove ${a.file_name}`}
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Remove attachment?"
        message={
          targetForDelete
            ? `"${targetForDelete.file_name}" will be permanently removed.`
            : ''
        }
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (confirmDeleteId) await att.removeAttachment(confirmDeleteId);
        }}
        onClose={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}