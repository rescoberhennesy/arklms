// src/components/dashboard/TeacherTodoWidget.tsx
//
// Phase 8c Slice C — teacher-side "To grade" widget.
//
// Consumes getTeacherTodoItems output. Two row kinds via the discriminator:
//   - 'submission_ungraded' links to the submission grader; shows
//     "Draft saved" pill when isDraftGrade is true.
//   - 'quiz_manual_pending' links to the quiz-attempt grader.
//
// Empty state: "Nothing to grade right now." Cap-10 enforced upstream.

'use client';

import { useMemo } from 'react';
import { FileQuestion, ClipboardList } from 'lucide-react';
import type { TeacherTodoItem } from '@/lib/types/dashboard';
import TodoRow from './TodoRow';

interface TeacherTodoWidgetProps {
  items: TeacherTodoItem[];
}

// Compact "Nh ago" / "Nd ago" formatter. Falls back to "just now" for
// very recent items.
function formatRelativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(ms / 3_600_000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(ms / 86_400_000);
  return `${days}d ago`;
}

// Display name for a student row, falling back to email then a placeholder.
function studentLabel(name: string | null, email: string | null): string {
  return name?.trim() || email?.trim() || 'Unknown student';
}

export default function TeacherTodoWidget({ items }: TeacherTodoWidgetProps) {
  const rows = useMemo(() => items, [items]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">To grade</h2>
        {rows.length > 0 && (
          <span className="text-xs text-slate-500">
            {rows.length} {rows.length === 1 ? 'item' : 'items'}
          </span>
        )}
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
          <div className="text-2xl">☕</div>
          <p className="mt-1 text-sm font-medium text-slate-700">
            Nothing to grade right now.
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            New submissions will show up here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((item) => {
            const isQuiz = item.kind === 'quiz_manual_pending';

            // Build the destination href. submission_ungraded uses
            // submissionId; quiz_manual_pending uses attemptId. Both nest
            // under the teacher's class+activity path.
            const href = isQuiz
              ? `/teacher/classes/${item.classId}/activities/${item.activityId}/attempts/${item.attemptId}`
              : `/teacher/classes/${item.classId}/activities/${item.activityId}/submissions/${item.submissionId}`;

            const kindBadge = isQuiz ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                <FileQuestion className="h-3 w-3" />
                Quiz
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                <ClipboardList className="h-3 w-3" />
                Assignment
              </span>
            );

            const draftBadge =
              !isQuiz && item.isDraftGrade ? (
                <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  Draft saved
                </span>
              ) : null;

            // Key: combine kind + the row-specific id so React keys are
            // stable and unique across both row types.
            const key = isQuiz
              ? `q:${item.attemptId}`
              : `s:${item.submissionId}`;

            return (
              <li key={key}>
                <TodoRow
                  href={href}
                  title={item.activityTitle}
                  meta={
                    <>
                      <span className="truncate">{item.className}</span>
                      <span aria-hidden>·</span>
                      <span className="truncate">
                        {studentLabel(item.studentName, item.studentEmail)}
                      </span>
                      <span aria-hidden>·</span>
                      <span>{formatRelativeAge(item.sortKey)}</span>
                    </>
                  }
                  rightSlot={
                    <>
                      {draftBadge}
                      {kindBadge}
                    </>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}