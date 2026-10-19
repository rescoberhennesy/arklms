// src/components/student/PracticeGenerateModal.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Upload, Sparkles, AlertCircle, Loader2, FileText, Info, Check } from 'lucide-react';
import {
  PRACTICE_DIFFICULTIES,
  PRACTICE_DIFFICULTY_LABELS,
  PRACTICE_QUESTION_KIND_LABELS,
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

const COUNTS = [5, 10, 15, 20] as const;
const QUESTION_KINDS = ['mc_single', 'mc_multi', 'true_false', 'short_answer'] as const;
type QuestionKind = (typeof QUESTION_KINDS)[number];
const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = '.pdf,.docx,.txt,.md';

// Shared segmented-control styles (charcoal = selected; red is kept for Generate).
const SEG_WRAP = 'grid gap-1 rounded-xl bg-zinc-100 p-1';
const segBtn = (on: boolean) =>
  `h-10 rounded-[9px] text-[13px] font-bold transition ${
    on ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
  }`;

export default function PracticeGenerateModal({ classes, onClose }: Props) {
  const router = useRouter();
  const [sourceKind, setSourceKind] = useState<'lesson' | 'upload'>('upload');
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id ?? '');
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [difficulty, setDifficulty] = useState<PracticeDifficulty>('mixed');
    const [count, setCount] = useState<5 | 10 | 15 | 20>(10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True when generation from a lesson failed, so we can offer "Upload my own instead".
  const [lessonFailed, setLessonFailed] = useState(false);
    const [kinds, setKinds] = useState<QuestionKind[]>([...QUESTION_KINDS]);

  function toggleKind(k: QuestionKind) {
    setKinds((prev) => {
      if (prev.includes(k)) {
        // Keep at least one type selected.
        return prev.length === 1 ? prev : prev.filter((x) => x !== k);
      }
      // Keep the original order so the request is stable.
      return QUESTION_KINDS.filter((x) => x === k || prev.includes(x));
    });
  }


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
        setLessons(Array.isArray(data?.lessons) ? data.lessons : []);
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

  // Group lessons under their module, keeping the server's order.
  const lessonGroups = useMemo(() => {
    const groups: { module: string; items: LessonOption[] }[] = [];
    for (const l of lessons) {
      const key = l.moduleTitle || 'Lessons';
      let g = groups.find((x) => x.module === key);
      if (!g) {
        g = { module: key, items: [] };
        groups.push(g);
      }
      g.items.push(l);
    }
    return groups;
  }, [lessons]);

  function switchSource(kind: 'lesson' | 'upload') {
    setSourceKind(kind);
    setError(null);
    setLessonFailed(false);
  }

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
    setLessonFailed(false);

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
    formData.set('kinds', kinds.join(','));
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

      if (!res.ok || !data?.sessionId) {
        // 422 = AI declined or zero questions validated. Show its message.
        setError(data?.message || data?.error || 'Generation failed.');
        if (sourceKind === 'lesson') setLessonFailed(true);
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

    const summary = `${count} questions · ${PRACTICE_DIFFICULTY_LABELS[difficulty]}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="practice-gen-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] sm:rounded-3xl"
      >
        {/* Header */}
        <header className="flex items-start gap-3.5 border-b border-zinc-100 px-6 pb-4 pt-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white">
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="practice-gen-title" className="text-lg font-extrabold text-zinc-900">
              Generate practice
            </h2>
            <p className="text-[13px] text-zinc-500">
              Questions with answers and short explanations, just for you.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* Source toggle + hint */}
          <div className="space-y-2">
            <div className={`${SEG_WRAP} grid-cols-2`}>
                <button type="button" onClick={() => switchSource('upload')} className={segBtn(sourceKind === 'upload')}>
                Upload a file
              </button>
              <button type="button" onClick={() => switchSource('lesson')} className={segBtn(sourceKind === 'lesson')}>
                From my classes
              </button>
            </div>
            <p className="flex items-start gap-1.5 px-1 text-xs leading-relaxed text-zinc-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {sourceKind === 'lesson'
                ? "Uses your teacher's lesson text and PDF. If a lesson has little content, try uploading your own notes."
                : 'Upload your notes, a handout or a reviewer (PDF, DOCX, TXT). Clear text works best.'}
            </p>
          </div>

          {/* Lesson picker */}
          {sourceKind === 'lesson' && (
            <div className="space-y-4">
              {classes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-center text-sm text-zinc-500">
                  You&apos;re not enrolled in any classes yet. Try uploading a file instead.
                </div>
              ) : (
                <>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-zinc-600">Class</span>
                    <select
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-4 focus:ring-zinc-900/5"
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-zinc-600">Lesson</span>
                    {loadingLessons ? (
                      <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading lessons…
                      </div>
                    ) : lessons.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3 text-sm text-zinc-500">
                        No lessons available in this class yet.
                      </div>
                    ) : (
                      <div className="max-h-64 space-y-3 overflow-y-auto pr-1" role="radiogroup" aria-label="Lesson">
                        {lessonGroups.map((g) => (
                          <div key={g.module} className="space-y-1.5">
                            <p className="px-0.5 pt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">
                              {g.module}
                            </p>
                            {g.items.map((l) => {
                              const on = l.id === selectedLessonId;
                              return (
                                <button
                                  key={l.id}
                                  type="button"
                                  role="radio"
                                  aria-checked={on}
                                  onClick={() => {
                                    setSelectedLessonId(l.id);
                                    setError(null);
                                    setLessonFailed(false);
                                  }}
                                  className={`flex w-full items-center gap-3 rounded-xl bg-white px-3.5 py-3 text-left transition ${
                                    on
                                      ? 'border-[1.5px] border-zinc-900 shadow-[0_0_0_3px_rgba(24,24,27,0.06)]'
                                      : 'border border-zinc-200 hover:border-zinc-300'
                                  }`}
                                >
                                  <span
                                    className={`h-[18px] w-[18px] shrink-0 rounded-full ${
                                      on ? 'border-[5px] border-red-600' : 'border-[1.5px] border-zinc-300'
                                    }`}
                                  />
                                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">
                                    {l.title}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* File upload */}
          {sourceKind === 'upload' && (
            <div className="space-y-2">
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-zinc-300 px-5 py-8 text-center transition hover:border-zinc-400 hover:bg-zinc-50">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100">
                  <Upload className="h-5 w-5 text-zinc-900" />
                </span>
                <span className="text-sm font-bold text-zinc-900">Choose files to upload</span>
                <span className="text-xs text-zinc-500">PDF, DOCX, TXT or MD · up to 3 files · 10 MB each</span>
                <input
                  type="file"
                  accept={ACCEPTED_EXTENSIONS}
                  multiple
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
              {files.length > 0 && (
                <ul className="space-y-1.5">
                  {files.map((f) => (
                    <li
                      key={f.name}
                      className="flex items-center gap-2.5 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-700"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="shrink-0 text-xs text-zinc-400">{(f.size / 1024).toFixed(0)} KB</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Difficulty */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-zinc-600">Difficulty</span>
            <div className={`${SEG_WRAP} grid-cols-4`}>
              {PRACTICE_DIFFICULTIES.map((d) => (
                <button key={d} type="button" onClick={() => setDifficulty(d)} className={segBtn(difficulty === d)}>
                  {PRACTICE_DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

                    {/* Question types */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-zinc-600">Question types</span>
            <div className="grid grid-cols-2 gap-2">
              {QUESTION_KINDS.map((k) => {
                const on = kinds.includes(k);
                const onlyOne = on && kinds.length === 1;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleKind(k)}
                    aria-pressed={on}
                    title={onlyOne ? 'Keep at least one type' : undefined}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition ${
                      on
                        ? 'border-[1.5px] border-zinc-900 bg-white text-zinc-900'
                        : 'border border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800'
                    }`}
                  >
                    <span
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md ${
                        on ? 'bg-zinc-900 text-white' : 'border-[1.5px] border-zinc-300'
                      }`}
                    >
                      {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="leading-tight">{PRACTICE_QUESTION_KIND_LABELS[k]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Question count */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-zinc-600">Number of questions</span>
            <div className={`${SEG_WRAP} grid-cols-4`}>
              {COUNTS.map((n) => (
                <button key={n} type="button" onClick={() => setCount(n)} className={segBtn(count === n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Error / fallback */}
          {error && (
            <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="flex items-start gap-2 text-sm text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
              {lessonFailed && (
                <button
                  type="button"
                  onClick={() => switchSource('upload')}
                  className="ml-6 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-zinc-900 ring-1 ring-red-200 transition hover:bg-red-100"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload my own instead
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center gap-3 border-t border-zinc-100 px-6 py-4">
          <span className="hidden flex-1 text-xs text-zinc-500 sm:block">{summary}</span>
          <span className="flex-1 sm:hidden" />
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-11 rounded-xl px-4 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
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