// src/components/dashboard/TeacherTodoWidget.tsx
//
// Teacher to-do widget with four sections:
//   - To grade (submission_ungraded)
//   - Manual review (quiz_manual_pending)
//   - Class deadlines (class_deadline)
//   - My tasks (personal_tasks)

'use client';

import { useMemo } from 'react';
import {
  FileQuestion,
  ClipboardList,
  Calendar as CalendarIcon,
} from 'lucide-react';
import type {
  TeacherTodoItem,
  TeacherTodoKind,
  PersonalTaskItem,
} from '@/lib/types/dashboard';
import TodoRow from './TodoRow';
import PersonalTasksPanel from './PersonalTasksPanel';

interface TeacherTodoWidgetProps {
  items: TeacherTodoItem[];
  personalTasks: PersonalTaskItem[];
}

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

function formatRelativeFuture(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 60_000) return 'soon';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(ms / 3_600_000);
  if (hrs < 24) return `in ${hrs}h`;
  const days = Math.round(ms / 86_400_000);
  return `in ${days}d`;
}

function studentLabel(name: string | null, email: string | null): string {
  return name?.trim() || email?.trim() || 'Unknown student';
}

const SECTION_TITLE: Record<TeacherTodoKind, string> = {
  submission_ungraded: 'To grade',
  quiz_manual_pending: 'Manual review',
  class_deadline: 'Class deadlines',
};

const SECTION_ORDER: TeacherTodoKind[] = [
  'submission_ungraded',
  'quiz_manual_pending',
  'class_deadline',
];

export default function TeacherTodoWidget({
  items,
  personalTasks,
}: TeacherTodoWidgetProps) {
  const grouped = useMemo(() => {
    const map: Record<TeacherTodoKind, TeacherTodoItem[]> = {
      submission_ungraded: [],
      quiz_manual_pending: [],
      class_deadline: [],
    };
    for (const item of items) map[item.kind].push(item);
    return map;
  }, [items]);

  const autoCount = items.length;
  const totalCount = autoCount + personalTasks.length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">To-do</h2>
        {totalCount > 0 && (
          <span className="text-xs text-slate-500">
            {totalCount} {totalCount === 1 ? 'item' : 'items'}
          </span>
        )}
      </header>

      {totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
          <div className="text-2xl">☕</div>
          <p className="mt-1 text-sm font-medium text-slate-700">
            Nothing to do right now.
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            New submissions and deadlines will appear here.
          </p>
          <div className="mt-3 w-full">
            <PersonalTasksPanel items={personalTasks} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {SECTION_ORDER.map((kind) => {
            const rows = grouped[kind];
            if (rows.length === 0) return null;
            return (
              <div key={kind}>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {SECTION_TITLE[kind]} · {rows.length}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {rows.map((item) => (
                    <li key={rowKey(item)}>
                      <TeacherRow item={item} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          <PersonalTasksPanel items={personalTasks} />
        </div>
      )}
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

function TeacherRow({ item }: { item: TeacherTodoItem }) {
  if (item.kind === 'class_deadline') {
    return <DeadlineRow item={item} />;
  }
  return <GradingRow item={item} />;
}

function GradingRow({ item }: { item: TeacherTodoItem }) {
  const isQuiz = item.kind === 'quiz_manual_pending';
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

  return (
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
  );
}

function DeadlineRow({ item }: { item: TeacherTodoItem }) {
  const href = `/teacher/classes/${item.classId}/activities/${item.activityId}`;
  return (
    <TodoRow
      href={href}
      title={item.activityTitle}
      meta={
        <>
          <span className="truncate">{item.className}</span>
          <span aria-hidden>·</span>
          <span className="text-amber-700">
            Due {formatRelativeFuture(item.sortKey)}
          </span>
        </>
      }
      rightSlot={
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          <CalendarIcon className="h-3 w-3" />
          Deadline
        </span>
      }
    />
  );
}