'use client';

import type { TrueFalseConfig } from '@/lib/types/quizzes';

interface TrueFalseEditorProps {
  config: TrueFalseConfig;
  onChange: (config: TrueFalseConfig) => void;
  disabled?: boolean;
}

export default function TrueFalseEditor({
  config,
  onChange,
  disabled = false,
}: TrueFalseEditorProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-600">
        Select which answer is correct.
      </p>
      <div className="flex gap-2">
        <label
          className={`flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            config.correct
              ? 'border-red-300 bg-red-50 text-red-900'
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
        >
          <input
            type="radio"
            name="tf_correct"
            checked={config.correct === true}
            onChange={() => onChange({ correct: true })}
            disabled={disabled}
            className="h-4 w-4 border-gray-300 text-red-600 focus:ring-red-500"
          />
          <span className="font-medium">True</span>
        </label>
        <label
          className={`flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            !config.correct
              ? 'border-red-300 bg-red-50 text-red-900'
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
        >
          <input
            type="radio"
            name="tf_correct"
            checked={config.correct === false}
            onChange={() => onChange({ correct: false })}
            disabled={disabled}
            className="h-4 w-4 border-gray-300 text-red-600 focus:ring-red-500"
          />
          <span className="font-medium">False</span>
        </label>
      </div>
    </div>
  );
}