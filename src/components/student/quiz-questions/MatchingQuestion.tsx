'use client';

import { ArrowRight } from 'lucide-react';
import type { MatchingAnswer } from '@/lib/types/quizzes';

interface MatchingQuestionProps {
  left: string[];
  right: string[];
  answer: MatchingAnswer;
  onChange: (answer: MatchingAnswer) => void;
  disabled?: boolean;
}

export default function MatchingQuestion({
  left,
  right,
  answer,
  onChange,
  disabled = false,
}: MatchingQuestionProps) {
  // Build leftIdx → rightIdx map
  const pairMap = new Map<number, number>();
  for (const [l, r] of answer.pairs ?? []) pairMap.set(l, r);

  function setPair(leftIdx: number, rightIdxRaw: string) {
    const rightIdx = rightIdxRaw === '' ? null : Number(rightIdxRaw);
    const otherPairs = (answer.pairs ?? []).filter(([l]) => l !== leftIdx);
    const nextPairs: Array<[number, number]> =
      rightIdx === null ? otherPairs : [...otherPairs, [leftIdx, rightIdx]];
    nextPairs.sort((a, b) => a[0] - b[0]);
    onChange({ pairs: nextPairs });
  }

  return (
    <div>
      <p className="mb-2 text-xs text-gray-500">
        Match each item on the left with the correct item on the right.
      </p>
      <ul className="space-y-2">
        {left.map((leftItem, leftIdx) => {
          const matched = pairMap.get(leftIdx);
          return (
            <li key={leftIdx} className="flex items-center gap-2">
              <span className="flex-1 truncate rounded bg-gray-50 px-2 py-2 text-sm text-gray-700">
                {leftItem}
              </span>
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
              <select
                value={matched === undefined ? '' : String(matched)}
                onChange={(e) => setPair(leftIdx, e.target.value)}
                disabled={disabled}
                className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">— pick a match —</option>
                {right.map((rightItem, rightIdx) => (
                  <option key={rightIdx} value={rightIdx}>
                    {rightItem}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    </div>
  );
}