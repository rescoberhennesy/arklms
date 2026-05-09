'use client';

import type { EssayAnswer } from '@/lib/types/quizzes';

interface EssayQuestionProps {
  answer: EssayAnswer;
  onChange: (answer: EssayAnswer) => void;
  disabled?: boolean;
}

export default function EssayQuestion({
  answer,
  onChange,
  disabled = false,
}: EssayQuestionProps) {
  return (
    <div>
      <textarea
        value={answer.text ?? ''}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="Write your essay here…"
        disabled={disabled}
        rows={10}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono leading-relaxed focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <p className="mt-1 text-xs text-gray-500">
        Your essay will be graded manually by your teacher after you submit.
      </p>
    </div>
  );
}