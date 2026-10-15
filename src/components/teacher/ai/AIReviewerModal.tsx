'use client';

// src/components/teacher/ai/AIReviewerModal.tsx
// Modal for the AI Reviewer Generator (Feature 2).
//
// Flow: select files -> generate (with live progress) -> edit + name -> add.
// On accept, calls onAccept(markdown, generationId, title, format). The
// parent attaches it as a PDF and/or ADDS it to the end of the lesson text.

import {
  useState,
  useRef,
  useEffect,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import {
  X,
  Upload,
  Sparkles,
  FileText,
  Loader2,
  Plus,
  AlertCircle,
  Trash2,
  Check,
  FileDown,
  AlignLeft,
} from 'lucide-react';
import MarkdownEditor from '@/components/dashboard/MarkdownEditor';

const MAX_FILES = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const ACCEPT =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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

// "InfoAssurance_handout.pdf" -> "InfoAssurance handout"
function nameFromFile(file: File | undefined): string {
  if (!file) return '';
  return file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** How the reviewer is added to the lesson. */
export type ReviewerFormat = 'pdf' | 'text';

type ReviewerResponse = {
  generationId?: string;
  markdown: string;
  warning?: string;
};

interface AIReviewerModalProps {
  open: boolean;
  classId: string | null;
  onClose: () => void;
  onAccept: (
    markdown: string,
    generationId: string | null,
    title: string,
    format: ReviewerFormat,
  ) => void;
}

export default function AIReviewerModal({
  open,
  classId,
  onClose,
  onAccept,
}: AIReviewerModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [teacherNote, setTeacherNote] = useState('');

  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Result (editable)
  const [draft, setDraft] = useState<ReviewerResponse | null>(null);
  const [editedMarkdown, setEditedMarkdown] = useState('');
  const [title, setTitle] = useState('');
    const [format, setFormat] = useState<ReviewerFormat>('pdf');

  // Seconds counter while generating, so the user can see it's still working.
  useEffect(() => {
    if (!isGenerating) return;
    setElapsed(0);
    const started = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [isGenerating]);

  if (!open) return null;

  function resetAll() {
    setFiles([]);
    setTeacherNote('');
    setError(null);
    setDraft(null);
    setEditedMarkdown('');
    setTitle('');
    setFormat('pdf');
    setIsDragging(false);
    setIsGenerating(false);
  }

  function handleClose() {
    if (isGenerating) return;
    resetAll();
    onClose();
  }

  function handleCancelGenerating() {
    abortRef.current?.abort();
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
        continue; // skip duplicates silently
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

    if (accepted.length > 0) setFiles((prev) => [...prev, ...accepted]);
    if (errors.length > 0) setError(errors.join(' '));
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

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      fd.append('teacherNote', teacherNote);
      if (classId) fd.append('classId', classId);

      const res = await fetch('/api/ai/reviewer', {
        method: 'POST',
        body: fd,
        signal: controller.signal,
      });

      // A crashed/timed-out server may not send JSON back.
      let json: Record<string, unknown> = {};
      try {
        json = await res.json();
      } catch {
        json = {};
      }

      if (!res.ok) {
        setError(
          (json.error as string) ??
            'The AI took too long or is busy right now. Please try again in a minute.',
        );
        return;
      }

      const markdown = (json.markdown as string) ?? '';
      setDraft({
        generationId: json.generationId as string | undefined,
        markdown,
        warning: json.warning as string | undefined,
      });
      setEditedMarkdown(markdown);
      setTitle((prev) => prev || nameFromFile(files[0]));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Generation cancelled.');
      } else {
        setError(err instanceof Error ? err.message : 'Network error.');
      }
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
    }
  }

  function handleAccept() {
    if (!draft || !editedMarkdown.trim()) return;
    onAccept(
      editedMarkdown,
      draft.generationId ?? null,
      title.trim() || 'Reviewer',
      format,
    );
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
            {draft ? 'Review and edit' : 'Generate Reviewer from Files'}
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
          {isGenerating ? (
            <GeneratingStage elapsed={elapsed} files={files} />
          ) : !draft ? (
            <ConfigStage
              files={files}
              teacherNote={teacherNote}
              setTeacherNote={setTeacherNote}
              isDragging={isDragging}
              error={error}
              fileInputRef={fileInputRef}
              onPickFiles={handlePickFiles}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onRemoveFile={removeFile}
            />
          ) : (
            <PreviewStage
              warning={draft.warning}
              title={title}
              setTitle={setTitle}
              format={format}
              setFormat={setFormat}
              markdown={editedMarkdown}
              setMarkdown={setEditedMarkdown}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
          {isGenerating ? (
            <button
              type="button"
              onClick={handleCancelGenerating}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          ) : !draft ? (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={files.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Generate
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setEditedMarkdown('');
                }}
                className="mr-auto rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
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
                disabled={!editedMarkdown.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" />
                Add to lesson
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Generating stage — moving progress bar + steps + timer
// ============================================================

const STEPS = [
  { at: 0, label: 'Uploading your files' },
  { at: 4, label: 'Reading your files' },
  { at: 15, label: 'Finding the key ideas' },
  { at: 35, label: 'Writing your reviewer' },
];

function GeneratingStage({ elapsed, files }: { elapsed: number; files: File[] }) {
  // The AI doesn't report real progress, so the bar eases toward 95% and
  // only completes when the result arrives. It never looks frozen.
  const percent = Math.min(95, Math.round(95 * (1 - Math.exp(-elapsed / 30))));
  const currentIndex = STEPS.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0);

  return (
    <div className="mx-auto max-w-md py-6">
      <div className="mb-5 flex flex-col items-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <Sparkles className="h-6 w-6 animate-pulse text-red-600" />
        </div>
        <p className="text-base font-semibold text-gray-900">
          {STEPS[currentIndex].label}…
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {files.length === 1 ? files[0].name : `${files.length} files`} ·{' '}
          {elapsed}s
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-red-600 transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(4, percent)}%` }}
        />
      </div>
      <p className="mt-1.5 text-right text-xs text-gray-400">{percent}%</p>

      {/* Steps */}
      <ul className="mt-4 space-y-2">
        {STEPS.map((s, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={s.label} className="flex items-center gap-2.5 text-sm">
              {done ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100">
                  <Check className="h-3 w-3 text-green-700" />
                </span>
              ) : active ? (
                <Loader2 className="h-5 w-5 animate-spin text-red-600" />
              ) : (
                <span className="h-5 w-5 rounded-full border-2 border-gray-200" />
              )}
              <span
                className={
                  done
                    ? 'text-gray-500'
                    : active
                      ? 'font-medium text-gray-900'
                      : 'text-gray-400'
                }
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-5 text-center text-xs text-gray-500">
        {elapsed < 45
          ? 'This usually takes 20–60 seconds. Please keep this window open.'
          : 'Bigger files take longer. Still working, hang tight…'}
      </p>
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
  isDragging: boolean;
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
    isDragging,
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
        reviewer with a summary and key concepts. You can edit and name it
        before adding it to the lesson.
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
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
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
          Optional steering (e.g. &quot;focus on chapter 3&quot;, &quot;for the midterm&quot;)
        </label>
        <textarea
          value={teacherNote}
          onChange={(e) => setTeacherNote(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          placeholder="Anything specific you want the AI to focus on?"
        />
      </div>

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
// Preview stage — name it + edit it before adding
// ============================================================

const FORMAT_OPTIONS: {
  value: ReviewerFormat;
  label: string;
  hint: string;
  icon: 'pdf' | 'text';
}[] = [
  { value: 'pdf', label: 'PDF only', hint: 'Attached as a file students can download', icon: 'pdf' },
  { value: 'text', label: 'Text only', hint: 'Added to the end of the lesson content', icon: 'text' },
];

function PreviewStage({
  warning,
  title,
  setTitle,
  format,
  setFormat,
  markdown,
  setMarkdown,
}: {
  warning?: string;
  title: string;
  setTitle: (v: string) => void;
  format: ReviewerFormat;
  setFormat: (v: ReviewerFormat) => void;
  markdown: string;
  setMarkdown: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      {warning && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{warning}</span>
        </div>
      )}

      {/* Name */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Reviewer name
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="e.g. Midterm Reviewer, Chapter 3 Summary"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        />
        <p className="mt-1 text-xs text-gray-500">
                    {format === 'pdf' ? (
            <>
              File:{' '}
              <span className="font-medium text-gray-700">
                {title.trim() || 'Reviewer'}.pdf
              </span>
            </>
          ) : (
            <>
              Heading in lesson:{' '}
              <span className="font-medium text-gray-700">
                📝 Reviewer: {title.trim() || 'Reviewer'}
              </span>
            </>
          )}
        </p>
      </div>

      {/* How to add it */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Add to lesson as
        </label>
          <div className="grid gap-2 sm:grid-cols-2">
          {FORMAT_OPTIONS.map((opt) => {
            const selected = format === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFormat(opt.value)}
                aria-pressed={selected}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition ${
                  selected
                    ? 'border-red-500 bg-red-50 ring-1 ring-red-500'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span
                  className={`mt-0.5 flex shrink-0 gap-0.5 ${
                    selected ? 'text-red-600' : 'text-gray-400'
                  }`}
                >
                                   {opt.icon === 'pdf' ? (
                    <FileDown className="h-4 w-4" />
                  ) : (
                    <AlignLeft className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900">
                    {opt.label}
                  </span>
                  <span className="block text-xs leading-snug text-gray-500">
                    {opt.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Editable content */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Content{' '}
          <span className="font-normal text-gray-400">· click anywhere to edit</span>
        </label>
        <MarkdownEditor
          value={markdown}
          onChange={setMarkdown}
          placeholder="The reviewer is empty."
          rows={12}
        />
      </div>

      <p className="text-xs text-gray-500">
        {format === 'pdf'
          ? 'The PDF is attached to the lesson right away. Your lesson text is not changed.'
                    : 'The text is added to the end of the lesson. Your current content stays. Click Save to make it final.'}
      </p>
    </div>
  );
}