'use client';

import type { McMultiAnswer } from '@/lib/types/quizzes';

interface McMultiQuestionProps {
  options: string[];
  answer: McMultiAnswer;
  onChange: (answer: McMultiAnswer) => void;
  disabled?: boolean;
}

export default function McMultiQuestion({
  options,
  answer,
  onChange,
  disabled = false,
}: McMultiQuestionProps) {
  const selectedSet = new Set(answer.selected ?? []);

  function toggle(idx: number) {
    if (selectedSet.has(idx)) {
      onChange({ selected: (answer.selected ?? []).filter((i) => i !== idx) });
    } else {
      onChange({
        selected: [...(answer.selected ?? []), idx].sort((a, b) => a - b),
      });
    }
  }

  return (
    <div>
      <p className="mb-2 text-xs text-gray-500">
        Select all that apply.
      </p>
      <ul className="space-y-2">
        {options.map((opt, idx) => {
          const checked = selectedSet.has(idx);
          return (
            <li key={idx}>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                  checked
                    ? 'border-red-300 bg-red-50 text-red-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(idx)}
                  disabled={disabled}
                  className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span>{opt}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}