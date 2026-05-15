'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Pencil,
  Save,
  Loader2,
  Eye,
  EyeOff,
  Upload,
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
  getSignedAttachmentUrl,
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
  const [confirmAiOverwrite, setConfirmAiOverwrite] = useState<{
    markdown: string;
    generationId: string | null;
  } | null>(null);

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

  // Called by the reviewer modal on accept. If the lesson already has
  // body content, prompt before clobbering; otherwise fill directly.
  function handleAiAccept(markdown: string, generationId: string | null) {
    if (body.trim().length > 0) {
      setConfirmAiOverwrite({ markdown, generationId });
      return;
    }
    applyAiDraft(markdown, generationId);
  }

  function applyAiDraft(markdown: string, generationId: string | null) {
    setBody(markdown);
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

      {/* Body editor */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Lesson content
          </h2>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setAiReviewerOpen(true)}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              title="Generate a study reviewer from PDFs/DOCX"
            >
              <Sparkles className="h-3 w-3" />
              Generate from files
            </button>
            {isDirty ? (
              <span className="text-amber-600">Unsaved changes</span>
            ) : (
              <span className="text-gray-400">Saved</span>
            )}
            <button
              type="button"
              onClick={handleSaveBody}
              disabled={isSaving || !isDirty}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Save
            </button>
          </div>
        </div>
        <MarkdownEditor
          value={body}
          onChange={setBody}
          placeholder="Write your lesson content here. Markdown supported."
          rows={12}
          disabled={isSaving}
        />
      </section>

      {/* AI quality analysis — read-only diagnostic, never mutates the lesson */}
      <AIQualityPanel lessonId={lesson.id} />
      <FlashcardDeckPanel lessonId={lesson.id} />

      {/* Attachments */}
      <AttachmentsSection
        lessonId={lesson.id}
        classId={classId}
        moduleId={lesson.module_id}
        attachments={lesson.attachments}
      />

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

      <ConfirmDialog
        open={confirmAiOverwrite !== null}
        title="Replace existing lesson content?"
        message="This lesson already has content. Accepting the AI draft will overwrite it. The change is not final until you click Save."
        confirmLabel="Replace"
        destructive
        onConfirm={async () => {
          if (confirmAiOverwrite) {
            applyAiDraft(
              confirmAiOverwrite.markdown,
              confirmAiOverwrite.generationId,
            );
            setConfirmAiOverwrite(null);
          }
        }}
        onClose={() => setConfirmAiOverwrite(null)}
      />
    </div>
  );
}

interface AttachmentsSectionProps {
  lessonId: string;
  classId: string;
  moduleId: string;
  attachments: LessonAttachment[];
}

function AttachmentsSection({
  lessonId,
  classId,
  moduleId,
  attachments,
}: AttachmentsSectionProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so the same file can be re-selected after error

    if (file.size > MAX_FILE_SIZE) {
      setUploadError(`File too large (${formatFileSize(file.size)}). Max 25 MB.`);
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const supabase = createBrowserClient();
      // Build path: <class_id>/<module_id>/<lesson_id>/<timestamp>-<safe_name>
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${classId}/${moduleId}/${lessonId}/${Date.now()}-${safeName}`;

      const { error: uploadErr } = await supabase.storage
        .from('lesson-attachments')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadErr) throw new Error(uploadErr.message);

      await recordAttachment({
        lessonId,
        filePath,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || null,
      });

      router.refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  function handleDownload(attachmentId: string) {
    startTransition(async () => {
      try {
        const url = await getSignedAttachmentUrl(attachmentId);
        // Opening in a new tab triggers download for non-inline types,
        // and lets the user view inline-able types in browser.
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Download failed.');
      }
    });
  }

  async function doDelete(attachmentId: string) {
    await deleteAttachment(attachmentId);
    router.refresh();
  }

  const targetForDelete = attachments.find((a) => a.id === confirmDeleteId);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-gray-500">
          <Paperclip className="h-3.5 w-3.5" />
          Attachments
        </h2>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelected}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {uploading ? 'Uploading…' : 'Upload file'}
        </button>
      </div>

      {uploadError && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{uploadError}</span>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="text-red-400 hover:text-red-600"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {attachments.length === 0 ? (
        <p className="text-xs text-gray-500">No attachments yet.</p>
      ) : (
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50/50 px-3 py-2"
            >
              <FileText className="h-4 w-4 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-800">{a.file_name}</p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(a.file_size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDownload(a.id)}
                className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                aria-label="Download"
                title="Download"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(a.id)}
                className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Delete"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete attachment?"
        message={
          targetForDelete
            ? `"${targetForDelete.file_name}" will be permanently removed.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmDeleteId) await doDelete(confirmDeleteId);
        }}
        onClose={() => setConfirmDeleteId(null)}
      />
    </section>
  );
}