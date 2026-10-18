// src/components/dashboard/StudentTodoWidget.tsx
//
// Student to-do: activities/quizzes due soon + personal tasks.

'use client';

import { useMemo } from 'react';
import type { StudentTodoItem, PersonalTaskItem } from '@/lib/types/dashboard';
import TodoRow from './TodoRow';
import PersonalTasksPanel from './PersonalTasksPanel';

interface StudentTodoWidgetProps {
  items: StudentTodoItem[];
  personalTasks: PersonalTaskItem[];
}

function formatRelativeDue(dueAtIso: string, isOverdue: boolean): string {
  const diffMs = Math.abs(new Date(dueAtIso).getTime() - Date.now());
  const mins = Math.round(diffMs / 60_000);
  const hrs = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);
  const magnitude = mins < 60 ? `${mins}m` : hrs < 24 ? `${hrs}h` : `${days}d`;
  return isOverdue ? `Overdue by ${magnitude}` : `Due in ${magnitude}`;
}

export default function StudentTodoWidget({ items, personalTasks }: StudentTodoWidgetProps) {
  const rows = useMemo(() => items, [items]);
  const totalCount = rows.length + personalTasks.length;

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
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-zinc-700">All caught up.</p>
            <p className="mt-0.5 text-xs text-zinc-500">Nothing due in the next 7 days.</p>
          </div>
        ) : (
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400">
              Due soon · <span className="text-red-600">{rows.length}</span>
            </p>
            <ul className="flex flex-col gap-1.5">
              {rows.map((item) => {
                const href = `/student/classes/${item.classId}/activities/${item.activityId}`;
                const relative = formatRelativeDue(item.dueAt, item.isOverdue);

                const kindBadge = (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
                    {item.activityKind === 'quiz' ? 'Quiz' : 'Activity'}
                  </span>
                );

                const quizStateBadge =
                  item.activityKind === 'quiz' && item.quizState ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        item.quizState === 'in_progress' ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-600'
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
                          <span className={item.isOverdue ? 'font-semibold text-red-600' : 'text-zinc-500'}>
                            {relative}
                          </span>
                          {item.lateAllowed && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="text-zinc-500">Late submission OK</span>
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
    </section>
  );
}