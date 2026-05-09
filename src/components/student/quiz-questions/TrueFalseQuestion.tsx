'use client';

import type { TrueFalseAnswer } from '@/lib/types/quizzes';

interface TrueFalseQuestionProps {
  answer: TrueFalseAnswer;
  touched: boolean;
  onChange: (answer: TrueFalseAnswer) => void;
  disabled?: boolean;
}

export default function TrueFalseQuestion({
  answer,
  touched,
  onChange,
  disabled = false,
}: TrueFalseQuestionProps) {
  const showSelectionTrue = touched && answer.selected === true;
  const showSelectionFalse = touched && answer.selected === false;

  return (
    <div className="flex gap-2">
      <label
        className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-3 text-sm font-medium ${
          showSelectionTrue
            ? 'border-red-300 bg-red-50 text-red-900'
            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <input
          type="radio"
          name="tf_choice"
          checked={showSelectionTrue}
          onChange={() => onChange({ selected: true })}
          disabled={disabled}
          className="h-4 w-4 border-gray-300 text-red-600 focus:ring-red-500"
        />
        True
      </label>
      <label
        className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-3 text-sm font-medium ${
          showSelectionFalse
            ? 'border-red-300 bg-red-50 text-red-900'
            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <input
          type="radio"
          name="tf_choice"
          checked={showSelectionFalse}
          onChange={() => onChange({ selected: false })}
          disabled={disabled}
          className="h-4 w-4 border-gray-300 text-red-600 focus:ring-red-500"
        />
        False
      </label>
    </div>
  );
}