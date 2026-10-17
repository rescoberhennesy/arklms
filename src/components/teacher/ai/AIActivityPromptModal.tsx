// src/components/teacher/ai/AIActivityPromptModal.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2, Paperclip, FileText, X } from 'lucide-react';
import Modal from '@/components/shared/Modal';
import {
  ACTIVITY_QUESTION_STYLE_LABELS,
  type ActivityQuestionStyle,
} from '@/lib/ai/prompts/activityPrompt';

const MAX_FILES = 5;
const MAX_FILE_MB = 20;

type Mode = 'replace' | 'append';

interface Props {
  open: boolean;
  activityId: string;
  hasExisting: boolean;
  onClose: () => void;
  onGenerated: (markdown: string, mode: Mode) => void;
}

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-60';

export default function AIActivityPromptModal({
  open,
  activityId,
  hasExisting,
  onClose,
  onGenerated,
}: Props) {
  const [countInput, setCountInput] = useState('5');
  const [style, setStyle] = useState<ActivityQuestionStyle>('mixed');
  const [focus, setFocus] = useState('');
  const [includePoints, setIncludePoints] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<Mode>('append');
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const count = Number(countInput);
  const countValid = Number.isInteger(count) && count >= 1 && count <= 10;

  // Reset each time it opens
  useEffect(() => {
    if (open) {
      setCountInput('5');
      setStyle('mixed');
      setFocus('');
      setIncludePoints(true);
      setFiles([]);
      setMode(hasExisting ? 'append' : 'replace');
      setError(null);
      setLoading(false);
      setSeconds(0);
    }
  }, [open, hasExisting]);

  // Seconds counter while generating
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const picked: File[] = [];
    for (const f of Array.from(list)) {
      if (!/\.(pdf|docx)$/i.test(f.name)) {
        setError(`${f.name}: only PDF and DOCX files are supported.`);
        continue;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        setError(`${f.name} is too large (max ${MAX_FILE_MB} MB).`);
        continue;
      }
      picked.push(f);
    }
    setFiles((prev) => {
      const merged = [...prev, ...picked];
      if (merged.length > MAX_FILES) setError(`You can upload at most ${MAX_FILES} files.`);
      return merged.slice(0, MAX_FILES);
    });
  }

  function handleClose() {
    if (loading) {
      abortRef.current?.abort();
      setLoading(false);
    }
    onClose();
  }

  async function handleGenerate() {
    if (!countValid || loading) return;
    setError(null);
    setLoading(true);
    setSeconds(0);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const form = new FormData();
      form.append('activityId', activityId);
      form.append('count', String(count));
      form.append('style', style);
      form.append('focus', focus);
      form.append('includePoints', includePoints ? 'true' : 'false');
      for (const f of files) form.append('files', f);

      const res = await fetch('/api/ai/activity-prompt', {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });

      let json: { markdown?: string; error?: string } = {};
      try {
        json = await res.json();
      } catch {
        setError(`Server returned an unexpected response (${res.status}).`);
        return;
      }

      if (!res.ok || !json.markdown) {
        setError(json.error || 'Failed to generate questions.');
        return;
      }

      onGenerated(json.markdown, hasExisting ? mode : 'replace');
      onClose();
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  return (
    <Modal
      open={open}
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-600" />
          Generate questions with AI
        </span>
      }
      onClose={handleClose}
      size="max-w-xl"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleGenerate();
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="aiq-count" className="mb-1 block text-xs font-semibold text-gray-700">
              Number of questions <span className="font-normal text-gray-400">(1–10)</span>
            </label>
            <input
              id="aiq-count"
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={countInput}
              onChange={(e) => setCountInput(e.target.value.replace(/\D/g, ''))}
              disabled={loading}
              className={`${inputClass} ${countValid ? '' : 'border-red-300'}`}
            />
          </div>
          <div>
            <label htmlFor="aiq-style" className="mb-1 block text-xs font-semibold text-gray-700">
              Question style
            </label>
            <select
              id="aiq-style"
              value={style}
              onChange={(e) => setStyle(e.target.value as ActivityQuestionStyle)}
              disabled={loading}
              className={inputClass}
            >
              {(Object.keys(ACTIVITY_QUESTION_STYLE_LABELS) as ActivityQuestionStyle[]).map((s) => (
                <option key={s} value={s}>
                  {ACTIVITY_QUESTION_STYLE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="aiq-focus" className="mb-1 block text-xs font-semibold text-gray-700">
            Notes for the AI <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            id="aiq-focus"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="e.g. Focus on compound interest, use a sari-sari store example, make it a bit challenging"
            disabled={loading}
            className={`${inputClass} resize-y`}
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold text-gray-700">
            Source files <span className="font-normal text-gray-400">(optional)</span>
          </p>
          <label
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-xs text-gray-600 hover:border-purple-400 hover:bg-purple-50 ${
              loading || files.length >= MAX_FILES ? 'pointer-events-none opacity-60' : ''
            }`}
          >
            <Paperclip className="h-4 w-4" />
            Upload PDF or DOCX (up to {MAX_FILES}, {MAX_FILE_MB} MB each)
            <input
              type="file"
              multiple
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-2 rounded-md border border-gray-200 px-2 py-1 text-xs"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-purple-600" />
                  <span className="flex-1 truncate text-gray-700">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    disabled={loading}
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-gray-500">
            With files, questions are based only on them. Without files, the
            AI uses the activity title, instructions and your focus.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includePoints}
            onChange={(e) => setIncludePoints(e.target.checked)}
            disabled={loading}
            className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          Show points per question (adds up to the activity's max points)
        </label>

        {hasExisting && (
          <fieldset className="rounded-lg border border-gray-200 p-3">
            <legend className="px-1 text-xs font-semibold text-gray-700">
              There's already a prompt
            </legend>
            <div className="flex flex-wrap gap-4 text-sm text-gray-700">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="aiq-mode"
                  checked={mode === 'append'}
                  onChange={() => setMode('append')}
                  disabled={loading}
                />
                Add below it
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="aiq-mode"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                  disabled={loading}
                />
                Replace it
              </label>
            </div>
          </fieldset>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <p className="text-xs text-gray-500">
          Nothing is saved yet. The questions go into the editor so you can
          review and edit them, then click Save.
        </p>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !countValid}
            className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating… {seconds}s
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}