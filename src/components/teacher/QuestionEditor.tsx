'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Trash2,
  Save,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Lock,
  Pencil,
} from 'lucide-react';
import MarkdownEditor from '@/components/dashboard/MarkdownEditor';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import Modal from '@/components/shared/Modal';
import {
  updateQuizQuestion,
  deleteQuizQuestion,
} from '@/lib/actions/quizzes';
import {
  type QuizQuestion,
  type QuestionConfig,
  type QuestionKind,
  type McSingleConfig,
  type McMultiConfig,
  type TrueFalseConfig,
  type ShortAnswerConfig,
  type EssayConfig,
  type MatchingConfig,
  QUESTION_KIND_LABELS,
  validateQuestionConfig,
} from '@/lib/types/quizzes';
import McSingleEditor from '@/components/teacher/question-editors/McSingleEditor';
import McMultiEditor from '@/components/teacher/question-editors/McMultiEditor';
import TrueFalseEditor from '@/components/teacher/question-editors/TrueFalseEditor';
import ShortAnswerEditor from '@/components/teacher/question-editors/ShortAnswerEditor';
import EssayEditor from '@/components/teacher/question-editors/EssayEditor';
import MatchingEditor from '@/components/teacher/question-editors/MatchingEditor';

// Short labels for the collapsed-row chip. Never wrap.
const KIND_SHORT_LABEL: Record<QuestionKind, string> = {
  mc_single: 'MC',
  mc_multi: 'MC+',
  true_false: 'T/F',
  short_answer: 'ID',
  essay: 'Essay',
  matching: 'Match',
};

const KIND_CHIP_CLASS: Record<QuestionKind, string> = {
  mc_single: 'bg-blue-50 text-blue-700',
  mc_multi: 'bg-indigo-50 text-indigo-700',
  true_false: 'bg-emerald-50 text-emerald-700',
  short_answer: 'bg-amber-50 text-amber-700',
  essay: 'bg-purple-50 text-purple-700',
  matching: 'bg-rose-50 text-rose-700',
};

function questionSignature(q: QuizQuestion): string {
  return [q.id, q.prompt, String(q.points), q.shuffleOptions ? 1 : 0, JSON.stringify(q.config)].join('§');
}

/** Plain-text preview for the row (drops markdown markers). */
function previewText(md: string): string {
  return md.replace(/[*_`#>~\[\]()!-]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ===========================================================================
// Row (default export): compact line in the list; click opens the modal
// ===========================================================================

interface QuestionRowProps {
  question: QuizQuestion;
  index: number;
  locked: boolean;
  onOpen: () => void;
  onChanged: () => Promise<void> | void;
  onError: (msg: string | null) => void;
}

export default function QuestionRow({
  question,
  index,
  locked,
  onOpen,
  onChanged,
  onError,
}: QuestionRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const preview = previewText(question.prompt);
  const kind = question.questionKind;

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteQuizQuestion(question.id);
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete question.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="group flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition hover:border-red-200 hover:bg-red-50/20">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        aria-label={`Edit question ${index + 1}`}
      >
        <span className="w-8 shrink-0 text-xs font-semibold text-gray-500">Q{index + 1}</span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_CHIP_CLASS[kind]}`}
          title={QUESTION_KIND_LABELS[kind]}
        >
          {KIND_SHORT_LABEL[kind]}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
          {preview || <span className="italic text-gray-400">No prompt yet. Click to fill in</span>}
        </span>
        <Pencil className="h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-gray-500" />
      </button>

      <span className="shrink-0 text-xs font-medium text-gray-500">
        {question.points} pt{question.points === 1 ? '' : 's'}
      </span>
      {locked ? (
        <Lock className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Locked" />
      ) : (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={deleting}
          className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          aria-label={`Delete question ${index + 1}`}
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this question?"
        message={`"${preview.slice(0, 80) || 'Untitled question'}" will be permanently removed from this quiz.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

// ===========================================================================
// Modal: edit one question at a time with Prev / Next / Save & next
// ===========================================================================

interface QuestionEditModalProps {
  questions: QuizQuestion[];
  /** Index of the question being edited, or null when closed. */
  index: number | null;
  locked: boolean;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

export function QuestionEditModal({
  questions,
  index,
  locked,
  onIndexChange,
  onClose,
  onChanged,
}: QuestionEditModalProps) {
  const dirtyRef = useRef(false);
  const question = index !== null ? questions[index] : undefined;

  // Close automatically if the question disappeared (e.g. deleted)
  useEffect(() => {
    if (index !== null && !question) onClose();
  }, [index, question, onClose]);

  function guard(action: () => void) {
    if (dirtyRef.current && !window.confirm('Discard your unsaved changes to this question?')) {
      return;
    }
    dirtyRef.current = false;
    action();
  }

  if (index === null || !question) return null;

  const total = questions.length;
  const hasPrev = index > 0;
  const hasNext = index < total - 1;

  return (
    <Modal
      open
      size="max-w-3xl"
      onClose={() => guard(onClose)}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span>Question {index + 1}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_CHIP_CLASS[question.questionKind]}`}
          >
            {QUESTION_KIND_LABELS[question.questionKind]}
          </span>
          <span className="text-xs font-normal text-gray-500">of {total}</span>
        </span>
      }
    >
      <QuestionForm
        key={question.id}
        question={question}
        locked={locked}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onDirtyChange={(d) => {
          dirtyRef.current = d;
        }}
        onChanged={onChanged}
        onPrev={() => guard(() => onIndexChange(index - 1))}
        onNext={() => guard(() => onIndexChange(index + 1))}
        onSavedAndContinue={() => {
          dirtyRef.current = false;
          if (hasNext) onIndexChange(index + 1);
          else onClose();
        }}
        onClose={() => guard(onClose)}
      />
    </Modal>
  );
}

// ===========================================================================
// Form for a single question (state resets per question via key)
// ===========================================================================

interface QuestionFormProps {
  question: QuizQuestion;
  locked: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onChanged: () => Promise<void> | void;
  onPrev: () => void;
  onNext: () => void;
  onSavedAndContinue: () => void;
  onClose: () => void;
}

function QuestionForm({
  question,
  locked,
  hasPrev,
  hasNext,
  onDirtyChange,
  onChanged,
  onPrev,
  onNext,
  onSavedAndContinue,
  onClose,
}: QuestionFormProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState(question.prompt);
  const [savedPrompt, setSavedPrompt] = useState(question.prompt);
  const [points, setPoints] = useState(String(question.points));
  const [savedPoints, setSavedPoints] = useState(String(question.points));
  const [shuffleOptions, setShuffleOptions] = useState(question.shuffleOptions);
  const [savedShuffleOptions, setSavedShuffleOptions] = useState(question.shuffleOptions);
  const [config, setConfig] = useState<QuestionConfig>(question.config);
  const [savedConfig, setSavedConfig] = useState<QuestionConfig>(question.config);

  const isDirty =
    prompt !== savedPrompt ||
    points !== savedPoints ||
    shuffleOptions !== savedShuffleOptions ||
    JSON.stringify(config) !== JSON.stringify(savedConfig);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  // Sync when the server copy changes (after refetch)
  const sig = questionSignature(question);
  const lastSig = useRef(sig);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  useEffect(() => {
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    setSavedPrompt(question.prompt);
    setSavedPoints(String(question.points));
    setSavedShuffleOptions(question.shuffleOptions);
    setSavedConfig(question.config);
    if (!isDirtyRef.current) {
      setPrompt(question.prompt);
      setPoints(String(question.points));
      setShuffleOptions(question.shuffleOptions);
      setConfig(question.config);
    }
  }, [sig, question]);

  const supportsShuffleOptions =
    question.questionKind === 'mc_single' ||
    question.questionKind === 'mc_multi' ||
    question.questionKind === 'matching';

  async function save(): Promise<boolean> {
    setError(null);
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError('Question prompt is required.');
      return false;
    }
    const ptsNum = Number(points);
    if (!Number.isFinite(ptsNum) || ptsNum <= 0) {
      setError('Points must be a positive number.');
      return false;
    }
    const validationErr = validateQuestionConfig(question.questionKind, config);
    if (validationErr) {
      setError(validationErr);
      return false;
    }

    setSaving(true);
    try {
      await updateQuizQuestion(question.id, {
        prompt: trimmedPrompt,
        points: ptsNum,
        shuffleOptions,
        config,
      });
      setSavedPrompt(trimmedPrompt);
      setPrompt(trimmedPrompt);
      setSavedPoints(points);
      setSavedShuffleOptions(shuffleOptions);
      setSavedConfig(config);
      await onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save question.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndContinue() {
    // Nothing changed: just move on
    if (!isDirty) {
      onSavedAndContinue();
      return;
    }
    const ok = await save();
    if (ok) onSavedAndContinue();
  }

  function renderKindEditor() {
    const disabled = saving || locked;
    switch (question.questionKind) {
      case 'mc_single':
        return <McSingleEditor config={config as McSingleConfig} onChange={setConfig} disabled={disabled} />;
      case 'mc_multi':
        return <McMultiEditor config={config as McMultiConfig} onChange={setConfig} disabled={disabled} />;
      case 'true_false':
        return <TrueFalseEditor config={config as TrueFalseConfig} onChange={setConfig} disabled={disabled} />;
      case 'short_answer':
        return <ShortAnswerEditor config={config as ShortAnswerConfig} onChange={setConfig} disabled={disabled} />;
      case 'essay':
        return <EssayEditor config={config as EssayConfig} onChange={setConfig} disabled={disabled} />;
      case 'matching':
        return <MatchingEditor config={config as MatchingConfig} onChange={setConfig} disabled={disabled} />;
    }
  }

  return (
    <div className="space-y-4">
      {locked && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Lock className="h-3.5 w-3.5" />
          Read-only: a student has already started this quiz.
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-700">Question</label>
        {locked ? (
          <div className="rounded-md border border-gray-200 bg-white p-3">
            {savedPrompt.trim() ? (
              <MarkdownContent body={savedPrompt} />
            ) : (
              <p className="text-sm italic text-gray-400">No prompt</p>
            )}
          </div>
        ) : (
          <MarkdownEditor
            value={prompt}
            onChange={setPrompt}
            placeholder="Type the question students will see."
            rows={3}
            disabled={saving}
          />
        )}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor={`pts-${question.id}`} className="mb-1 block text-xs font-semibold text-gray-700">
            Points
          </label>
          <input
            id={`pts-${question.id}`}
            type="text"
            inputMode="decimal"
            maxLength={6}
            value={points}
            onChange={(e) =>
              setPoints(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))
            }
            disabled={saving || locked}
            className="w-24 rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          />
        </div>
        {supportsShuffleOptions && (
          <label className="mb-2 inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={shuffleOptions}
              onChange={(e) => setShuffleOptions(e.target.checked)}
              disabled={saving || locked}
              className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            Shuffle choices for each student
          </label>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">Answer key</p>
        {renderKindEditor()}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

            {/* Footer: arrows left, one action right */}
      <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            disabled={!hasPrev || saving}
            aria-label="Previous question"
            title="Previous question"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext || saving}
            aria-label="Next question"
            title="Next question"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {locked ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        ) : (
          <div className="flex items-center gap-3">
            {isDirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
            <button
              type="button"
              onClick={() => void handleSaveAndContinue()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {hasNext ? 'Save & next' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}