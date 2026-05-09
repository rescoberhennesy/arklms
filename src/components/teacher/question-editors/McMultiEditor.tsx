'use client';

import { Plus, X } from 'lucide-react';
import type { McMultiConfig } from '@/lib/types/quizzes';

interface McMultiEditorProps {
  config: McMultiConfig;
  onChange: (config: McMultiConfig) => void;
  disabled?: boolean;
}

export default function McMultiEditor({
  config,
  onChange,
  disabled = false,
}: McMultiEditorProps) {
  const correctSet = new Set(config.correct);

  function setOption(idx: number, value: string) {
    const next = [...config.options];
    next[idx] = value;
    onChange({ ...config, options: next });
  }

  function addOption() {
    onChange({ ...config, options: [...config.options, ''] });
  }

  function removeOption(idx: number) {
    if (config.options.length <= 2) return;
    const nextOptions = config.options.filter((_, i) => i !== idx);
    // Drop any correct entries pointing at the removed index, and shift
    // higher indices down by one.
    const nextCorrect = config.correct
      .filter((c) => c !== idx)
      .map((c) => (c > idx ? c - 1 : c));
    onChange({ options: nextOptions, correct: nextCorrect });
  }

  function toggleCorrect(idx: number) {
    if (correctSet.has(idx)) {
      onChange({
        ...config,
        correct: config.correct.filter((c) => c !== idx),
      });
    } else {
      onChange({
        ...config,
        correct: [...config.correct, idx].sort((a, b) => a - b),
      });
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-600">
        Provide at least two options. Tick every option that should count
        as correct. Scoring is all-or-nothing — students must select every
        correct option and no wrong ones.
      </p>

      <ul className="space-y-2">
        {config.options.map((opt, idx) => (
          <li key={idx} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={correctSet.has(idx)}
              onChange={() => toggleCorrect(idx)}
              disabled={disabled}
              aria-label={`Mark option ${idx + 1} as correct`}
              className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <input
              type="text"
              value={opt}
              onChange={(e) => setOption(idx, e.target.value)}
              placeholder={`Option ${idx + 1}`}
              disabled={disabled}
              className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => removeOption(idx)}
              disabled={disabled || config.options.length <= 2}
              title={
                config.options.length <= 2
                  ? 'At least 2 options are required'
                  : 'Remove option'
              }
              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Remove option"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={addOption}
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <Plus className="h-3 w-3" />
        Add option
      </button>

      {config.correct.length === 0 && (
        <p className="text-xs text-amber-700">
          ⚠ At least one option must be marked as correct.
        </p>
      )}
    </div>
  );
}