'use client';

import { PenLine } from 'lucide-react';
import type { EssayConfig } from '@/lib/types/quizzes';

interface EssayEditorProps {
  config: EssayConfig;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onChange: (config: EssayConfig) => void;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  disabled?: boolean;
}

// EssayConfig is `Record<string, never>` — there is nothing to configure.
// Onchange exists only to satisfy the per-kind editor contract from
// QuestionEditor. We never call it.
export default function EssayEditor(_props: EssayEditorProps) {
  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
      <div className="mb-1 inline-flex items-center gap-1.5 font-medium">
        <PenLine className="h-4 w-4" />
        Manual grading required
      </div>
      <p className="text-xs text-blue-800">
        Essays are not auto-graded. After the student submits, you&apos;ll
        review their response and assign points up to the question&apos;s
        max. The grader UI lands in slice C7.
      </p>
    </div>
  );
}