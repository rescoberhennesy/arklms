// src/components/dashboard/StudentTodoWidget.tsx
//
// Student "Due soon" widget with two sections:
//   - Auto-derived activity rows (assignments + quizzes)
//   - Personal tasks (user-created)
//
// Both sections render even when the other is empty. Widget collapses
// to a single empty-state only when BOTH are empty.

'use client';

import { useMemo } from 'react';
import { ClipboardList, FileQuestion } from 'lucide-react';
import type {
  StudentTodoItem,
  PersonalTaskItem,
} from '@/lib/types/dashboard';
import TodoRow from './TodoRow';
import PersonalTasksPanel from './PersonalTasksPanel';

interface StudentTodoWidgetProps {
  items: StudentTodoItem[];
  personalTasks: PersonalTaskItem[];
}

function formatRelativeDue(dueAtIso: string, isOverdue: boolean): string {
  const due = new Date(dueAtIso).getTime();
  const now = Date.now();
  const diffMs = Math.abs(due - now);
  const mins = Math.round(diffMs / 60_000);
  const hrs = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);

  let magnitude: string;
  if (mins < 60) magnitude = `${mins}m`;
  else if (hrs < 24) magnitude = `${hrs}h`;
  else magnitude = `${days}d`;

  return isOverdue ? `overdue by ${magnitude}` : `due in ${magnitude}`;
}

export default function StudentTodoWidget({
  items,
  personalTasks,
}: StudentTodoWidgetProps) {
  const rows = useMemo(() => items, [items]);
  const totalCount = rows.length + personalTasks.length;

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
          <div className="text-2xl">🎉</div>
          <p className="mt-1 text-sm font-medium text-slate-700">
            All caught up!
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Nothing due in the next 7 days.
          </p>
          <div className="mt-3 w-full">
            <PersonalTasksPanel items={personalTasks} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Due soon · {rows.length}
              </p>
              <ul className="flex flex-col gap-1.5">
                {rows.map((item) => {
                  const href = `/student/classes/${item.classId}/activities/${item.activityId}`;
                  const relative = formatRelativeDue(item.dueAt, item.isOverdue);

                  const kindBadge =
                    item.activityKind === 'quiz' ? (
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

                  const quizStateBadge =
                    item.activityKind === 'quiz' && item.quizState ? (
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          item.quizState === 'in_progress'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {item.quizState === 'in_progress' ? 'Continue' : 'Start'}
                      </span>
                    ) : null;

                  return (
                    <li key={`${item.activityKind}:${item.activityId}`}>
                      <TodoRow
                        href={href}
                        title={item.title}
                        meta={
                          <>
                            <span className="truncate">{item.className}</span>
                            <span aria-hidden>·</span>
                            <span
                              className={
                                item.isOverdue
                                  ? 'font-medium text-red-600'
                                  : 'text-slate-500'
                              }
                            >
                              {relative}
                            </span>
                            {item.lateAllowed && (
                              <>
                                <span aria-hidden>·</span>
                                <span className="text-amber-600">
                                  late submission OK
                                </span>
                              </>
                            )}
                          </>
                        }
                        rightSlot={
                          <>
                            {quizStateBadge}
                            {kindBadge}
                          </>
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <PersonalTasksPanel items={personalTasks} />
        </div>
      )}
    </section>
  );
}