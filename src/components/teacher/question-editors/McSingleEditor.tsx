'use client';

import { Plus, X } from 'lucide-react';
import type { McSingleConfig } from '@/lib/types/quizzes';

interface McSingleEditorProps {
  config: McSingleConfig;
  onChange: (config: McSingleConfig) => void;
  disabled?: boolean;
}

export default function McSingleEditor({
  config,
  onChange,
  disabled = false,
}: McSingleEditorProps) {
  const correctIndex = config.correct[0] ?? 0;

  function setOption(idx: number, value: string) {
    const next = [...config.options];
    next[idx] = value;
    onChange({ ...config, options: next });
  }

  function addOption() {
    onChange({
      ...config,
      options: [...config.options, ''],
    });
  }

  function removeOption(idx: number) {
    if (config.options.length <= 2) return; // enforce min 2
    const nextOptions = config.options.filter((_, i) => i !== idx);
    // Adjust correct index if we removed at or before the correct spot
    let nextCorrect: [number] = [correctIndex];
    if (idx === correctIndex) {
      // The correct option got deleted — fall back to first option
      nextCorrect = [0];
    } else if (idx < correctIndex) {
      nextCorrect = [correctIndex - 1];
    }
    onChange({ options: nextOptions, correct: nextCorrect });
  }

  function setCorrect(idx: number) {
    onChange({ ...config, correct: [idx] });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-600">
        Provide at least two options. Click the radio button next to the
        correct answer.
      </p>

      <ul className="space-y-2">
        {config.options.map((opt, idx) => (
          <li key={idx} className="flex items-center gap-2">
            <input
              type="radio"
              name="mc_single_correct"
              checked={correctIndex === idx}
              onChange={() => setCorrect(idx)}
              disabled={disabled}
              aria-label={`Mark option ${idx + 1} as correct`}
              className="h-4 w-4 border-gray-300 text-red-600 focus:ring-red-500"
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
    </div>
  );
}