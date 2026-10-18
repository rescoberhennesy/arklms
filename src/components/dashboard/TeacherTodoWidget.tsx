// src/components/dashboard/TeacherTodoWidget.tsx
//
// Teacher to-do widget — grading work + personal tasks.
//   - To grade (submission_ungraded)
//   - Manual review (quiz_manual_pending)
//   - My tasks (PersonalTasksPanel)

'use client';

import { useMemo } from 'react';
import type { TeacherTodoItem, TeacherTodoKind, PersonalTaskItem } from '@/lib/types/dashboard';
import TodoRow from './TodoRow';
import PersonalTasksPanel from './PersonalTasksPanel';

interface TeacherTodoWidgetProps {
  items: TeacherTodoItem[];
  personalTasks: PersonalTaskItem[];
}

type GradingKind = Exclude<TeacherTodoKind, 'class_deadline'>;

const SECTION_TITLE: Record<GradingKind, string> = {
  submission_ungraded: 'To grade',
  quiz_manual_pending: 'Manual review',
};

const SECTION_ORDER: GradingKind[] = ['submission_ungraded', 'quiz_manual_pending'];

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

function studentLabel(name: string | null, email: string | null): string {
  return name?.trim() || email?.trim() || 'Unknown student';
}

export default function TeacherTodoWidget({ items, personalTasks }: TeacherTodoWidgetProps) {
  const grouped = useMemo(() => {
    const map: Record<GradingKind, TeacherTodoItem[]> = {
      submission_ungraded: [],
      quiz_manual_pending: [],
    };
    for (const item of items) {
      if (item.kind === 'class_deadline') continue;
      map[item.kind].push(item);
    }
    return map;
  }, [items]);

  const gradingCount = grouped.submission_ungraded.length + grouped.quiz_manual_pending.length;
  const totalCount = gradingCount + personalTasks.length;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-extrabold text-zinc-900">To-do</h2>
        {totalCount > 0 && (
          <span className="text-xs text-zinc-400">
            {totalCount} {totalCount === 1 ? 'item' : 'items'}
          </span>
        )}
      </header>

      <div className="flex flex-col gap-4">
        {gradingCount === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-zinc-700">Nothing to grade right now.</p>
            <p className="mt-0.5 text-xs text-zinc-500">New submissions and quiz attempts will appear here.</p>
          </div>
        ) : (
          SECTION_ORDER.map((kind) => {
            const rows = grouped[kind];
            if (rows.length === 0) return null;
            return (
              <div key={kind}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400">
                  {SECTION_TITLE[kind]} · <span className="text-red-600">{rows.length}</span>
                </p>
                <ul className="flex flex-col gap-1.5">
                  {rows.map((item) => (
                    <li key={rowKey(item)}>
                      <GradingRow item={item} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}

        <PersonalTasksPanel items={personalTasks} />
      </div>
    </section>
  );
}

function rowKey(item: TeacherTodoItem): string {
  switch (item.kind) {
    case 'submission_ungraded':
      return `s:${item.submissionId}`;
    case 'quiz_manual_pending':
      return `q:${item.attemptId}`;
    case 'class_deadline':
      return `d:${item.activityId}`;
  }
}

function GradingRow({ item }: { item: TeacherTodoItem }) {
  const isQuiz = item.kind === 'quiz_manual_pending';
  const href = isQuiz
    ? `/teacher/classes/${item.classId}/activities/${item.activityId}/attempts/${item.attemptId}`
    : `/teacher/classes/${item.classId}/activities/${item.activityId}/submissions/${item.submissionId}`;

  const kindBadge = (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
      {isQuiz ? 'Quiz' : 'Activity'}
    </span>
  );

  const draftBadge =
    !isQuiz && item.isDraftGrade ? (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Draft saved</span>
    ) : null;

  return (
    <TodoRow
      href={href}
      title={item.activityTitle}
      meta={
        <>
          <span className="truncate">{item.className}</span>
          <span aria-hidden>·</span>
          <span className="truncate">{studentLabel(item.studentName, item.studentEmail)}</span>
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
  );
}