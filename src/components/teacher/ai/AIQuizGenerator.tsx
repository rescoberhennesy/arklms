// src/components/teacher/ai/AIQuizGenerator.tsx
// Modal for generating quiz questions with AI. Opens from QuizEditor.

'use client';

import { useEffect, useState, useTransition } from 'react';
import { X, Upload, Sparkles, Loader2, AlertCircle, BookOpen, FileText } from 'lucide-react';
import type { AIGeneratableKind, QuestionMix } from '@/lib/ai/prompts/quizGenerator';

interface LessonOption {
  id: string;
  title: string;
  moduleTitle: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  activityId: string;
  classId: string;
  onGenerated: () => void; // refetch quiz view
}

const KIND_LABELS: Record<AIGeneratableKind, string> = {
  mc_single: 'Multiple choice (single answer)',
  mc_multi: 'Multiple choice (multiple answers)',
  true_false: 'True / False',
  short_answer: 'Short answer',
};

const KIND_ORDER: AIGeneratableKind[] = [
  'mc_single',
  'mc_multi',
  'true_false',
  'short_answer',
];

const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXT = '.pdf,.docx,.txt,.md';

export default function AIQuizGenerator({
  open,
  onClose,
  activityId,
  classId,
  onGenerated,
}: Props) {
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [sourceLessonId, setSourceLessonId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [mix, setMix] = useState<QuestionMix>({
    mc_single: 5,
    true_false: 3,
  });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    inserted: number;
    rejected: number;
    rejectedReasons: string[];
    sourceNote: string | null;
    message?: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  // Fetch class lessons when modal opens
  useEffect(() => {
    if (!open) return;
    setLessonsLoading(true);
    fetch(`/api/ai/quiz/lessons?classId=${encodeURIComponent(classId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.lessons)) setLessons(data.lessons);
      })
      .catch(() => {
        // Non-fatal — teacher can still upload a file
      })
      .finally(() => setLessonsLoading(false));
  }, [open, classId]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setSourceLessonId('');
      setFiles([]);
      setMix({ mc_single: 5, true_false: 3 });
      setError(null);
      setResult(null);
    }
  }, [open]);

  function updateMix(kind: AIGeneratableKind, value: string) {
    const n = value === '' ? 0 : parseInt(value, 10);
    if (Number.isNaN(n) || n < 0 || n > 20) return;
    setMix((prev) => ({ ...prev, [kind]: n }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length > MAX_FILES) {
      setError(`Max ${MAX_FILES} files.`);
      return;
    }
    for (const f of picked) {
      if (f.size > MAX_FILE_SIZE) {
        setError(`"${f.name}" exceeds 10 MB.`);
        return;
      }
    }
    setError(null);
    setFiles(picked);
  }

  const totalRequested = Object.values(mix).reduce((a, b) => a + (b ?? 0), 0);
  const canSubmit =
    totalRequested > 0 &&
    totalRequested <= 25 &&
    (sourceLessonId !== '' || files.length > 0) &&
    !pending;

  function handleSubmit() {
    setError(null);
    setResult(null);
    if (!canSubmit) return;

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set('activityId', activityId);
        if (sourceLessonId) fd.set('sourceLessonId', sourceLessonId);
        fd.set('mix', JSON.stringify(mix));
        for (const f of files) fd.append('files', f);

        const res = await fetch('/api/ai/quiz/generate', {
          method: 'POST',
          body: fd,
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? 'Generation failed.');
          return;
        }
        setResult({
          inserted: json.inserted ?? 0,
          rejected: json.rejected ?? 0,
          rejectedReasons: json.rejectedReasons ?? [],
          sourceNote: json.sourceNote ?? null,
          message: json.message,
        });
        if ((json.inserted ?? 0) > 0) {
          onGenerated();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Generate questions with AI
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-4">
          {result ? (
            <ResultView result={result} />
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Pick a source lesson or upload a file. AI will draft questions
                you can review and edit before publishing.
              </p>

              <Section title="Source content" icon={<BookOpen className="h-4 w-4" />}>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  From an existing lesson
                </label>
                <select
                  value={sourceLessonId}
                  onChange={(e) => setSourceLessonId(e.target.value)}
                  disabled={pending || lessonsLoading}
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
                >
                  <option value="">
                    {lessonsLoading ? 'Loading lessons…' : '— Select a lesson (optional) —'}
                  </option>
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.moduleTitle} → {l.title}
                    </option>
                  ))}
                </select>

                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Or upload a file (PDF, DOCX, TXT, MD — max 3 files, 10 MB each)
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <Upload className="h-4 w-4" />
                    Choose files
                    <input
                      type="file"
                      multiple
                      accept={ACCEPTED_EXT}
                      onChange={handleFileChange}
                      disabled={pending}
                      className="hidden"
                    />
                  </label>
                  {files.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {files.map((f) => (
                        <li key={f.name} className="flex items-center gap-2 text-xs text-gray-600">
                          <FileText className="h-3 w-3" />
                          {f.name} ({Math.round(f.size / 1024)} KB)
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Section>

              <Section title="Question mix" icon={<Sparkles className="h-4 w-4" />}>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {KIND_ORDER.map((k) => (
                    <div key={k} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2">
                      <span className="text-sm text-gray-700">{KIND_LABELS[k]}</span>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={mix[k] ?? 0}
                        onChange={(e) => updateMix(k, e.target.value)}
                        disabled={pending}
                        className="w-16 rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Total: <span className="font-semibold">{totalRequested}</span> question(s).
                  Max 25.
                </p>
              </Section>

              {error && (
                <div className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function ResultView({
  result,
}: {
  result: {
    inserted: number;
    rejected: number;
    rejectedReasons: string[];
    sourceNote: string | null;
    message?: string;
  };
}) {
  if (result.message) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-semibold">The AI couldn&apos;t generate questions.</div>
        <p className="mt-1">{result.message}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900">
        <div className="font-semibold">
          {result.inserted} question{result.inserted === 1 ? '' : 's'} added to your quiz.
        </div>
        <p className="mt-1 text-xs">
          Review them in the editor below. Edit any prompt, answer, or distractor before publishing.
        </p>
      </div>
      {result.sourceNote && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
          <span className="font-medium">AI note:</span> {result.sourceNote}
        </div>
      )}
      {result.rejected > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="font-semibold">
            {result.rejected} question{result.rejected === 1 ? '' : 's'} were skipped (failed validation).
          </div>
          {result.rejectedReasons.length > 0 && (
            <ul className="mt-1 list-inside list-disc">
              {result.rejectedReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}