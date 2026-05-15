
'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import {
  Trash2,
  Save,
  Loader2,
  ChevronDown,
  ChevronRight,
  Lock,
} from 'lucide-react';
import MarkdownEditor from '@/components/dashboard/MarkdownEditor';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
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

interface QuestionEditorProps {
  question: QuizQuestion;
  index: number;
  locked: boolean;
  onChanged: () => Promise<void> | void;
  onError: (msg: string | null) => void;
}

// Short labels for the collapsed-row chip. Never wrap.
const KIND_SHORT_LABEL: Record<QuestionKind, string> = {
  mc_single: 'MC',
  mc_multi: 'MC+',
  true_false: 'T/F',
  short_answer: 'SA',
  essay: 'Essay',
  matching: 'Match',
};

// Colour tone per kind — small visual hint without being loud.
const KIND_CHIP_CLASS: Record<QuestionKind, string> = {
  mc_single: 'bg-blue-50 text-blue-700',
  mc_multi: 'bg-indigo-50 text-indigo-700',
  true_false: 'bg-emerald-50 text-emerald-700',
  short_answer: 'bg-amber-50 text-amber-700',
  essay: 'bg-purple-50 text-purple-700',
  matching: 'bg-rose-50 text-rose-700',
};

function questionSignature(q: QuizQuestion): string {
  return [
    q.id,
    q.prompt,
    String(q.points),
    q.shuffleOptions ? 1 : 0,
    JSON.stringify(q.config),
  ].join('§');
}

export default function QuestionEditor({
  question,
  index,
  locked,
  onChanged,
  onError,
}: QuestionEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [prompt, setPrompt] = useState(question.prompt);
  const [savedPrompt, setSavedPrompt] = useState(question.prompt);
  const [points, setPoints] = useState(String(question.points));
  const [savedPoints, setSavedPoints] = useState(String(question.points));
  const [shuffleOptions, setShuffleOptions] = useState(question.shuffleOptions);
  const [savedShuffleOptions, setSavedShuffleOptions] = useState(
    question.shuffleOptions,
  );
  const [config, setConfig] = useState<QuestionConfig>(question.config);
  const [savedConfig, setSavedConfig] = useState<QuestionConfig>(
    question.config,
  );

  const isDirty =
    prompt !== savedPrompt ||
    points !== savedPoints ||
    shuffleOptions !== savedShuffleOptions ||
    JSON.stringify(config) !== JSON.stringify(savedConfig);

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

  function handleSave() {
    onError(null);

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      onError('Question prompt is required.');
      return;
    }
    const ptsNum = Number(points);
    if (!Number.isFinite(ptsNum) || ptsNum <= 0) {
      onError('Points must be a positive number.');
      return;
    }
    const validationErr = validateQuestionConfig(question.questionKind, config);
    if (validationErr) {
      onError(validationErr);
      return;
    }

    startTransition(async () => {
      try {
        await updateQuizQuestion(question.id, {
          prompt: trimmedPrompt,
          points: ptsNum,
          shuffleOptions,
          config,
        });
        setSavedPrompt(trimmedPrompt);
        setSavedPoints(points);
        setSavedShuffleOptions(shuffleOptions);
        setSavedConfig(config);
        await onChanged();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to save question.');
      }
    });
  }

  function handleCancel() {
    setPrompt(savedPrompt);
    setPoints(savedPoints);
    setShuffleOptions(savedShuffleOptions);
    setConfig(savedConfig);
  }

  async function handleDelete() {
    try {
      await deleteQuizQuestion(question.id);
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete question.');
    }
  }

  function renderKindEditor() {
    const editorDisabled = isPending || locked;
    switch (question.questionKind) {
      case 'mc_single':
        return (
          <McSingleEditor
            config={config as McSingleConfig}
            onChange={(c) => setConfig(c)}
            disabled={editorDisabled}
          />
        );
      case 'mc_multi':
        return (
          <McMultiEditor
            config={config as McMultiConfig}
            onChange={(c) => setConfig(c)}
            disabled={editorDisabled}
          />
        );
      case 'true_false':
        return (
          <TrueFalseEditor
            config={config as TrueFalseConfig}
            onChange={(c) => setConfig(c)}
            disabled={editorDisabled}
          />
        );
      case 'short_answer':
        return (
          <ShortAnswerEditor
            config={config as ShortAnswerConfig}
            onChange={(c) => setConfig(c)}
            disabled={editorDisabled}
          />
        );
      case 'essay':
        return (
          <EssayEditor
            config={config as EssayConfig}
            onChange={(c) => setConfig(c)}
            disabled={editorDisabled}
          />
        );
      case 'matching':
        return (
          <MatchingEditor
            config={config as MatchingConfig}
            onChange={(c) => setConfig(c)}
            disabled={editorDisabled}
          />
        );
    }
  }

  const shortLabel = KIND_SHORT_LABEL[question.questionKind];
  const fullLabel = QUESTION_KIND_LABELS[question.questionKind];
  const chipClass = KIND_CHIP_CLASS[question.questionKind];

  return (
    <div
      className={`rounded-lg border transition ${
        expanded ? 'border-red-200 bg-red-50/20' : 'border-gray-200 bg-white'
      }`}
    >
      {/* Collapsed row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} question ${index + 1}`}
        >
          {/* Chevron — fixed width */}
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
          )}

          {/* Question number — fixed width, never wraps */}
          <span className="shrink-0 text-xs font-semibold text-gray-500">
            Q{index + 1}
          </span>

          {/* Kind chip — short label, fixed width */}
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chipClass}`}
            title={fullLabel}
          >
            {shortLabel}
          </span>

          {/* Prompt — takes all remaining space, truncates */}
          <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
            {savedPrompt.trim() || (
              <span className="italic text-gray-400">No prompt yet</span>
            )}
          </span>
        </button>

        {/* Right-side meta — fixed widths, never wraps */}
        <span className="shrink-0 text-xs font-medium text-gray-500">
          {savedPoints} pt{Number(savedPoints) === 1 ? '' : 's'}
        </span>
        {locked && (
          <Lock
            className="h-3.5 w-3.5 shrink-0 text-amber-600"
            aria-label="Locked"
          />
        )}
        {!locked && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={isPending}
            className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            aria-label="Delete question"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Expanded panel — unchanged behaviour */}
      {expanded && (
        <div className="space-y-3 border-t border-gray-100 px-3 py-3">
          {/* Full label visible inside expanded panel so the abbreviation
              in the chip isn't ambiguous when editing. */}
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chipClass}`}
            >
              {fullLabel}
            </span>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">
                Prompt
              </label>
              {locked && (
                <span className="text-xs italic text-amber-700">
                  Read-only (locked)
                </span>
              )}
            </div>
            {locked ? (
              <div className="rounded-md border border-gray-200 bg-white p-2">
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
                placeholder="The question students will see. Markdown supported."
                rows={3}
                disabled={isPending}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Points
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                disabled={isPending || locked}
                className="w-24 rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
              />
            </div>
            {supportsShuffleOptions && (
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={shuffleOptions}
                  onChange={(e) => setShuffleOptions(e.target.checked)}
                  disabled={isPending || locked}
                  className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                Shuffle option order per student
              </label>
            )}
          </div>

          <div className="rounded-md border border-gray-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Answer key
            </p>
            {renderKindEditor()}
          </div>

          {!locked && (
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
              {isDirty && (
                <span className="mr-auto text-xs text-amber-600">
                  Unsaved changes
                </span>
              )}
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPending || !isDirty}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending || !isDirty}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Save
              </button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this question?"
        message={`"${savedPrompt.trim().slice(0, 80) || 'Untitled question'}" will be permanently removed from this quiz.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
