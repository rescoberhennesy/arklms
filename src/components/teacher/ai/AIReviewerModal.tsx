'use client';

// src/components/teacher/ai/AIReviewerModal.tsx
// Modal for the AI Reviewer Generator (Feature 2).
//
// Flow: select files -> set options -> generate -> preview -> accept/discard.
// On accept, calls onAccept(markdown, generationId) which the parent
// uses to fill a lesson body.

import {
  useState,
  useRef,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import {
  X,
  Upload,
  Sparkles,
  FileText,
  Loader2,
  Check,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import MarkdownContent from '@/components/dashboard/MarkdownContent';

const MAX_FILES = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || name.endsWith('.docx')) return true;
  return (
    file.type === 'application/pdf' ||
    file.type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ReviewerResponse = {
  generationId?: string;
  markdown: string;
  warning?: string;
};

interface AIReviewerModalProps {
  open: boolean;
  classId: string | null;
  onClose: () => void;
  onAccept: (markdown: string, generationId: string | null) => void;
}

export default function AIReviewerModal({
  open,
  classId,
  onClose,
  onAccept,
}: AIReviewerModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [teacherNote, setTeacherNote] = useState('');
  const [includePractice, setIncludePractice] = useState(true);

  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewerResponse | null>(null);

  if (!open) return null;

  function resetAll() {
    setFiles([]);
    setTeacherNote('');
    setIncludePractice(true);
    setError(null);
    setDraft(null);
    setIsDragging(false);
    setIsGenerating(false);
  }

  function handleClose() {
    if (isGenerating) return;
    resetAll();
    onClose();
  }

  function addFiles(incoming: File[]) {
    setError(null);
    const accepted: File[] = [];
    const errors: string[] = [];

    for (const f of incoming) {
      if (!isAcceptedFile(f)) {
        errors.push(`${f.name}: only PDF and DOCX are supported`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        errors.push(`${f.name}: exceeds 20 MB`);
        continue;
      }
      if (files.find((x) => x.name === f.name && x.size === f.size)) {
        // skip duplicates silently
        continue;
      }
      accepted.push(f);
    }

    const room = MAX_FILES - files.length;
    if (accepted.length > room) {
      errors.push(
        `Only ${MAX_FILES} files allowed total — ${accepted.length - room} skipped.`,
      );
      accepted.splice(room);
    }

    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted]);
    }
    if (errors.length > 0) {
      setError(errors.join(' '));
    }
  }

  function handlePickFiles(e: ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    addFiles(Array.from(list));
    e.target.value = '';
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const list = e.dataTransfer.files;
    if (!list || list.length === 0) return;
    addFiles(Array.from(list));
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleGenerate() {
    if (files.length === 0) {
      setError('Add at least one file to generate from.');
      return;
    }
    setError(null);
    setIsGenerating(true);
    setDraft(null);

    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      fd.append('teacherNote', teacherNote);
      fd.append('includePractice', String(includePractice));
      if (classId) fd.append('classId', classId);

      const res = await fetch('/api/ai/reviewer', {
        method: 'POST',
        body: fd,
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? 'Failed to generate reviewer.');
        setIsGenerating(false);
        return;
      }

      setDraft({
        generationId: json.generationId,
        markdown: json.markdown,
        warning: json.warning,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setIsGenerating(false);
    }
  }

  function handleAccept() {
    if (!draft) return;
    onAccept(draft.markdown, draft.generationId ?? null);
    resetAll();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-gray-900">
            <Sparkles className="h-4 w-4 text-red-600" />
            Generate Reviewer from Files
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={isGenerating}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!draft ? (
            <ConfigStage
              files={files}
              teacherNote={teacherNote}
              setTeacherNote={setTeacherNote}
              includePractice={includePractice}
              setIncludePractice={setIncludePractice}
              isDragging={isDragging}
              isGenerating={isGenerating}
              error={error}
              fileInputRef={fileInputRef}
              onPickFiles={handlePickFiles}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onRemoveFile={removeFile}
            />
          ) : (
            <PreviewStage draft={draft} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
          {!draft ? (
            <>
              <button
                type="button"
                onClick={handleClose}
                disabled={isGenerating}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || files.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                }}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleAccept}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                <Check className="h-3.5 w-3.5" />
                Use this
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Config stage — file picker + options
// ============================================================

interface ConfigStageProps {
  files: File[];
  teacherNote: string;
  setTeacherNote: (v: string) => void;
  includePractice: boolean;
  setIncludePractice: (v: boolean) => void;
  isDragging: boolean;
  isGenerating: boolean;
  error: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onPickFiles: (e: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onRemoveFile: (index: number) => void;
}

function ConfigStage(props: ConfigStageProps) {
  const {
    files,
    teacherNote,
    setTeacherNote,
    includePractice,
    setIncludePractice,
    isDragging,
    isGenerating,
    error,
    fileInputRef,
    onPickFiles,
    onDrop,
    onDragOver,
    onDragLeave,
    onRemoveFile,
  } = props;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Upload lecture PDFs or notes (DOCX) and the AI will draft a study
        reviewer with a summary, key concepts, and optional practice
        questions. You can edit everything before publishing.
      </p>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 transition ${
          isDragging
            ? 'border-red-400 bg-red-50'
            : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
        }`}
      >
        <Upload className="mb-1 h-5 w-5 text-gray-400" />
        <p className="text-sm font-medium text-gray-700">
          Drop files here or click to browse
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          PDF or DOCX · up to {MAX_FILES} files · max 20 MB each
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          onChange={onPickFiles}
          className="hidden"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2"
            >
              <FileText className="h-4 w-4 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-800">{f.name}</p>
                <p className="text-xs text-gray-500">{formatSize(f.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => onRemoveFile(i)}
                disabled={isGenerating}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                aria-label="Remove file"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Teacher note */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Optional steering (e.g. "focus on chapter 3", "for the midterm")
        </label>
        <textarea
          value={teacherNote}
          onChange={(e) => setTeacherNote(e.target.value)}
          disabled={isGenerating}
          rows={2}
          className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          placeholder="Anything specific you want the AI to focus on?"
        />
      </div>

      {/* Options */}
      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={includePractice}
          onChange={(e) => setIncludePractice(e.target.checked)}
          disabled={isGenerating}
          className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
        />
        Include practice questions with reveal-on-click answers
      </label>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Preview stage — show generated markdown
// ============================================================

function PreviewStage({ draft }: { draft: ReviewerResponse }) {
  return (
    <div className="space-y-3">
      {draft.warning && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{draft.warning}</span>
        </div>
      )}
      <div className="rounded-md border border-gray-200 bg-white p-4">
        <MarkdownContent body={draft.markdown} />
      </div>
      <p className="text-xs text-gray-500">
        Accepting will replace this lesson&apos;s content with the draft
        above. You can edit anything afterward.
      </p>
    </div>
  );
}
