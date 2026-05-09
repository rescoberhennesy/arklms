'use client';

import { Plus, X, ArrowRight } from 'lucide-react';
import type { MatchingConfig } from '@/lib/types/quizzes';

interface MatchingEditorProps {
  config: MatchingConfig;
  onChange: (config: MatchingConfig) => void;
  disabled?: boolean;
}

export default function MatchingEditor({
  config,
  onChange,
  disabled = false,
}: MatchingEditorProps) {
  // Build a map of leftIndex → rightIndex from pairs (one pair per left).
  // Layer B's MatchingConfig allows multiple pairs but the natural matching
  // semantics is "each left maps to exactly one right". We enforce that here.
  const pairMap = new Map<number, number>();
  for (const [l, r] of config.pairs) pairMap.set(l, r);

  function setLeft(idx: number, value: string) {
    const next = [...config.left];
    next[idx] = value;
    onChange({ ...config, left: next });
  }

  function setRight(idx: number, value: string) {
    const next = [...config.right];
    next[idx] = value;
    onChange({ ...config, right: next });
  }

  function addLeft() {
    onChange({ ...config, left: [...config.left, ''] });
  }

  function addRight() {
    onChange({ ...config, right: [...config.right, ''] });
  }

  function removeLeft(idx: number) {
    if (config.left.length <= 2) return;
    const nextLeft = config.left.filter((_, i) => i !== idx);
    const nextPairs = config.pairs
      .filter(([l]) => l !== idx)
      .map(([l, r]): [number, number] => [l > idx ? l - 1 : l, r]);
    onChange({ ...config, left: nextLeft, pairs: nextPairs });
  }

  function removeRight(idx: number) {
    if (config.right.length <= 2) return;
    const nextRight = config.right.filter((_, i) => i !== idx);
    const nextPairs = config.pairs
      .filter(([, r]) => r !== idx)
      .map(([l, r]): [number, number] => [l, r > idx ? r - 1 : r]);
    onChange({ ...config, right: nextRight, pairs: nextPairs });
  }

  function setPair(leftIdx: number, rightIdxRaw: string) {
    const rightIdx = rightIdxRaw === '' ? null : Number(rightIdxRaw);
    const otherPairs = config.pairs.filter(([l]) => l !== leftIdx);
    const nextPairs: Array<[number, number]> =
      rightIdx === null ? otherPairs : [...otherPairs, [leftIdx, rightIdx]];
    nextPairs.sort((a, b) => a[0] - b[0]);
    onChange({ ...config, pairs: nextPairs });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-600">
        Build the two columns of items, then for each left-side item pick
        the right-side item it pairs with. Provide at least 2 of each.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {/* LEFT */}
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Left column
          </p>
          <ul className="space-y-2">
            {config.left.map((item, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <span className="w-5 text-xs font-mono text-gray-400">
                  L{idx + 1}
                </span>
                <input
                  type="text"
                  value={item}
                  onChange={(e) => setLeft(idx, e.target.value)}
                  placeholder={`Left item ${idx + 1}`}
                  disabled={disabled}
                  className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => removeLeft(idx)}
                  disabled={disabled || config.left.length <= 2}
                  className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Remove left item"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={addLeft}
            disabled={disabled}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Add left item
          </button>
        </div>

        {/* RIGHT */}
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Right column
          </p>
          <ul className="space-y-2">
            {config.right.map((item, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <span className="w-5 text-xs font-mono text-gray-400">
                  R{idx + 1}
                </span>
                <input
                  type="text"
                  value={item}
                  onChange={(e) => setRight(idx, e.target.value)}
                  placeholder={`Right item ${idx + 1}`}
                  disabled={disabled}
                  className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => removeRight(idx)}
                  disabled={disabled || config.right.length <= 2}
                  className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Remove right item"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={addRight}
            disabled={disabled}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Add right item
          </button>
        </div>
      </div>

      {/* PAIRS */}
      <div className="rounded-md border border-gray-200 bg-white p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Answer key
        </p>
        {config.left.length === 0 ? (
          <p className="text-sm italic text-gray-400">
            Add left items first.
          </p>
        ) : (
          <ul className="space-y-2">
            {config.left.map((leftItem, leftIdx) => {
              const matched = pairMap.get(leftIdx);
              return (
                <li key={leftIdx} className="flex items-center gap-2">
                  <span className="flex-1 truncate rounded bg-gray-50 px-2 py-1 text-sm text-gray-700">
                    <span className="mr-1 font-mono text-xs text-gray-400">
                      L{leftIdx + 1}
                    </span>
                    {leftItem || (
                      <span className="italic text-gray-400">(empty)</span>
                    )}
                  </span>
                  <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  <select
                    value={matched === undefined ? '' : String(matched)}
                    onChange={(e) => setPair(leftIdx, e.target.value)}
                    disabled={disabled}
                    className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
                  >
                    <option value="">— pick a right item —</option>
                    {config.right.map((rightItem, rightIdx) => (
                      <option key={rightIdx} value={rightIdx}>
                        R{rightIdx + 1}: {rightItem || '(empty)'}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}