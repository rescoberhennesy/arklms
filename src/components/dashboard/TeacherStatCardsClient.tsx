// src/components/dashboard/TeacherStatCardsClient.tsx
// Teacher dashboard stat cards + their modals.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, Calendar as CalendarIcon, ListChecks, type LucideIcon } from 'lucide-react';
import DeadlinesModal from './DeadlinesModal';
import PendingTasksModal from './PendingTasksModal';
import type { DeadlineItem } from '@/lib/actions/dashboard';
import type { TeacherTodoItem, PersonalTaskItem } from '@/lib/types/dashboard';

interface Props {
  totalClasses: number;
  deadlinesCount: number;
  pendingCount: number;
  deadlineItems: DeadlineItem[];
  todoItems: TeacherTodoItem[];
  personalTasks: PersonalTaskItem[];
}

export default function TeacherStatCardsClient({
  totalClasses,
  deadlinesCount,
  pendingCount,
  deadlineItems,
  todoItems,
  personalTasks,
}: Props) {
  const [open, setOpen] = useState<null | 'deadlines' | 'pending'>(null);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total classes" value={totalClasses} icon={BookOpen} href="/teacher/classes" />
        <StatCard
          label="Deadlines (next 7 days)"
          value={deadlinesCount}
          icon={CalendarIcon}
          onClick={() => setOpen('deadlines')}
        />
        <StatCard
          label="Pending tasks"
          value={pendingCount}
          icon={ListChecks}
          alert={pendingCount > 0}
          onClick={() => setOpen('pending')}
        />
      </div>

      {open === 'deadlines' && (
        <DeadlinesModal items={deadlineItems} role="teacher" onClose={() => setOpen(null)} />
      )}
      {open === 'pending' && (
        <PendingTasksModal
          role="teacher"
          todoItems={todoItems}
          personalTasks={personalTasks}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  href,
  onClick,
  alert = false,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  href?: string;
  onClick?: () => void;
  /** Shows the number in red when something needs attention. */
  alert?: boolean;
}) {
  const className =
    'flex w-full items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-zinc-300 hover:shadow-md';

  const content = (
    <>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] text-zinc-500">{label}</span>
        <span
          className={`block text-[28px] font-extrabold leading-tight ${
            alert ? 'text-red-600' : 'text-zinc-900'
          }`}
        >
          {value}
        </span>
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}