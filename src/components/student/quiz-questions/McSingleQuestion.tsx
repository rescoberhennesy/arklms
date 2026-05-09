'use client';

import type { McSingleAnswer } from '@/lib/types/quizzes';

interface McSingleQuestionProps {
  options: string[];
  answer: McSingleAnswer;
  onChange: (answer: McSingleAnswer) => void;
  disabled?: boolean;
}

export default function McSingleQuestion({
  options,
  answer,
  onChange,
  disabled = false,
}: McSingleQuestionProps) {
  return (
    <ul className="space-y-2">
      {options.map((opt, idx) => {
        const checked = answer.selected === idx;
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
                type="radio"
                name="mc_single"
                checked={checked}
                onChange={() => onChange({ selected: idx })}
                disabled={disabled}
                className="h-4 w-4 border-gray-300 text-red-600 focus:ring-red-500"
              />
              <span>{opt}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}