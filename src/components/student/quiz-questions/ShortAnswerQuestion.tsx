'use client';

import type { ShortAnswerAnswer } from '@/lib/types/quizzes';

interface ShortAnswerQuestionProps {
  answer: ShortAnswerAnswer;
  onChange: (answer: ShortAnswerAnswer) => void;
  disabled?: boolean;
}

export default function ShortAnswerQuestion({
  answer,
  onChange,
  disabled = false,
}: ShortAnswerQuestionProps) {
  return (
    <input
      type="text"
      value={answer.text ?? ''}
      onChange={(e) => onChange({ text: e.target.value })}
      placeholder="Type your answer…"
      disabled={disabled}
      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}