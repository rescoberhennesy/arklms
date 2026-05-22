// src/components/student/PracticeGenerateModal.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Upload, BookOpen, Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import {
  PRACTICE_DIFFICULTIES,
  PRACTICE_DIFFICULTY_LABELS,
  type PracticeDifficulty,
} from '@/lib/types/practice';

interface ClassOption {
  id: string;
  name: string;
  color: string | null;
}

interface LessonOption {
  id: string;
  title: string;
  moduleTitle: string;
}

interface Props {
  classes: ClassOption[];
  onClose: () => void;
}

const COUNTS = [5, 10, 15] as const;
const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = '.pdf,.docx,.txt,.md';

export default function PracticeGenerateModal({ classes, onClose }: Props) {
  const router = useRouter();
  const [sourceKind, setSourceKind] = useState<'lesson' | 'upload'>('lesson');
  const [selectedClassId, setSelectedClassId] = useState<string>(
    classes[0]?.id ?? '',
  );
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [difficulty, setDifficulty] = useState<PracticeDifficulty>('mixed');
  const [count, setCount] = useState<5 | 10 | 15>(10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, submitting]);

  // Fetch lessons when class changes
  useEffect(() => {
    if (sourceKind !== 'lesson' || !selectedClassId) return;
    let cancelled = false;
    setLoadingLessons(true);
    setSelectedLessonId('');
    // Reuse the AI quiz lessons endpoint — it returns the same shape.
    fetch(`/api/ai/quiz/lessons?classId=${encodeURIComponent(selectedClassId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.lessons)) {
          setLessons(data.lessons);
        } else {
          setLessons([]);
        }
      })
      .catch(() => {
        if (!cancelled) setLessons([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingLessons(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedClassId, sourceKind]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const fileList = e.target.files;
    if (!fileList) return;
    const incoming = Array.from(fileList);
    if (incoming.length > MAX_FILES) {
      setError(`Up to ${MAX_FILES} files only.`);
      return;
    }
    for (const f of incoming) {
      if (f.size > MAX_FILE_SIZE) {
        setError(`"${f.name}" is over 10 MB.`);
        return;
      }
    }
    setFiles(incoming);
  }

  async function handleSubmit() {
    setError(null);

    if (sourceKind === 'lesson' && !selectedLessonId) {
      setError('Please choose a lesson.');
      return;
    }
    if (sourceKind === 'upload' && files.length === 0) {
      setError('Please upload at least one file.');
      return;
    }

    setSubmitting(true);

    const formData = new FormData();
    formData.set('sourceKind', sourceKind);
    formData.set('difficulty', difficulty);
    formData.set('requestedCount', String(count));
    if (sourceKind === 'lesson') {
      formData.set('sourceLessonId', selectedLessonId);
    } else {
      for (const f of files) formData.append('files', f);
    }

    try {
      const res = await fetch('/api/ai/practice/generate', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        // 422 = AI declined or zero questions validated. Show its message.
        setError(data?.message || data?.error || 'Generation failed.');
        setSubmitting(false);
        return;
      }

      if (!data?.sessionId) {
        setError(data?.message || 'No session was created.');
        setSubmitting(false);
        return;
      }

      // Success — push to the new session
      router.push(`/student/practice/${data.sessionId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-red-600" />
            <h2 className="text-base font-semibold text-gray-900">
              Generate practice
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Source toggle */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Source
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSourceKind('lesson')}
                className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-sm font-medium ${
                  sourceKind === 'lesson'
                    ? 'border-red-300 bg-red-50 text-red-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <BookOpen className="h-5 w-5" />
                From a lesson
              </button>
              <button
                type="button"
                onClick={() => setSourceKind('upload')}
                className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-sm font-medium ${
                  sourceKind === 'upload'
                    ? 'border-red-300 bg-red-50 text-red-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Upload className="h-5 w-5" />
                Upload my own
              </button>
            </div>
          </div>

          {/* Lesson picker */}
          {sourceKind === 'lesson' && (
            <div className="space-y-3">
              {classes.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-sm text-gray-500">
                  You're not enrolled in any classes yet. Try uploading a file instead.
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Class
                    </label>
                    <select
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Lesson
                    </label>
                    {loadingLessons ? (
                      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading lessons…
                      </div>
                    ) : lessons.length === 0 ? (
                      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm italic text-gray-500">
                        No lessons available in this class.
                      </div>
                    ) : (
                      <select
                        value={selectedLessonId}
                        onChange={(e) => setSelectedLessonId(e.target.value)}
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                      >
                        <option value="">Choose a lesson…</option>
                        {lessons.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.moduleTitle ? `${l.moduleTitle} — ${l.title}` : l.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* File upload */}
          {sourceKind === 'upload' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Files (PDF, DOCX, TXT, or MD — max 3, 10 MB each)
              </label>
              <input
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                multiple
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-red-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-red-700 hover:file:bg-red-100"
              />
              {files.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-gray-600">
                  {files.map((f) => (
                    <li key={f.name} className="truncate">
                      • {f.name} <span className="text-gray-400">({(f.size / 1024).toFixed(0)} KB)</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Difficulty */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Difficulty
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {PRACTICE_DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={`rounded-md border px-2 py-2 text-xs font-medium ${
                    difficulty === d
                      ? 'border-red-300 bg-red-50 text-red-900'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {PRACTICE_DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          {/* Question count */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Number of questions
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium ${
                    count === n
                      ? 'border-red-300 bg-red-50 text-red-900'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}