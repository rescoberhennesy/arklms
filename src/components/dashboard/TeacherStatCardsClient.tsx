// src/components/dashboard/TeacherStatCardsClient.tsx
// Owns modal state for the teacher dashboard stat cards.

'use client';

import { useState } from 'react';
import { BookOpen, Calendar as CalendarIcon, ListChecks } from 'lucide-react';
import StatCardsRow from './StatCardsRow';
import DeadlinesModal from './DeadlinesModal';
import PendingTasksModal from './PendingTasksModal';
import type { DeadlineItem } from '@/lib/actions/dashboard';
import type { TeacherTodoItem } from '@/lib/types/dashboard';
import type { PersonalTaskItem } from '@/lib/types/dashboard';

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
      <StatCardsRow
        items={[
          {
            label: 'Total classes',
            value: totalClasses,
            icon: BookOpen,
            tone: 'red',
            href: '/teacher/classes',
          },
          {
            label: 'Deadlines (7d)',
            value: deadlinesCount,
            icon: CalendarIcon,
            tone: 'amber',
            onClick: () => setOpen('deadlines'),
          },
          {
            label: 'Pending tasks',
            value: pendingCount,
            icon: ListChecks,
            tone: 'indigo',
            onClick: () => setOpen('pending'),
          },
        ]}
      />

      {open === 'deadlines' && (
        <DeadlinesModal
          items={deadlineItems}
          role="teacher"
          onClose={() => setOpen(null)}
        />
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