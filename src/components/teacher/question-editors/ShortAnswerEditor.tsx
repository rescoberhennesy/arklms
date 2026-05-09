'use client';

import { Plus, X } from 'lucide-react';
import type { ShortAnswerConfig } from '@/lib/types/quizzes';

interface ShortAnswerEditorProps {
  config: ShortAnswerConfig;
  onChange: (config: ShortAnswerConfig) => void;
  disabled?: boolean;
}

export default function ShortAnswerEditor({
  config,
  onChange,
  disabled = false,
}: ShortAnswerEditorProps) {
  function setAcceptable(idx: number, value: string) {
    const next = [...config.acceptable];
    next[idx] = value;
    onChange({ ...config, acceptable: next });
  }

  function addAcceptable() {
    onChange({ ...config, acceptable: [...config.acceptable, ''] });
  }

  function removeAcceptable(idx: number) {
    if (config.acceptable.length <= 1) return;
    onChange({
      ...config,
      acceptable: config.acceptable.filter((_, i) => i !== idx),
    });
  }

  function toggleCaseSensitive(checked: boolean) {
    onChange({ ...config, case_sensitive: checked });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-600">
        List every accepted answer string. The student&apos;s response is
        graded correct if it{' '}
        {config.case_sensitive ? 'exactly' : 'case-insensitively'} matches
        any of these. Auto-graded; teachers can override per-response after.
      </p>

      <ul className="space-y-2">
        {config.acceptable.map((acc, idx) => (
          <li key={idx} className="flex items-center gap-2">
            <input
              type="text"
              value={acc}
              onChange={(e) => setAcceptable(idx, e.target.value)}
              placeholder={`Acceptable answer ${idx + 1}`}
              disabled={disabled}
              className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => removeAcceptable(idx)}
              disabled={disabled || config.acceptable.length <= 1}
              title={
                config.acceptable.length <= 1
                  ? 'At least 1 acceptable answer is required'
                  : 'Remove'
              }
              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Remove acceptable answer"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addAcceptable}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
          Add acceptable answer
        </button>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={config.case_sensitive}
            onChange={(e) => toggleCaseSensitive(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          Case-sensitive matching
        </label>
      </div>
    </div>
  );
}