// src/components/dashboard/StudentStatCardsClient.tsx

'use client';

import { useState } from 'react';
import { BookOpen, Calendar as CalendarIcon, ListChecks } from 'lucide-react';
import StatCardsRow from './StatCardsRow';
import DeadlinesModal from './DeadlinesModal';
import PendingTasksModal from './PendingTasksModal';
import type { DeadlineItem } from '@/lib/actions/dashboard';
import type { StudentTodoItem, PersonalTaskItem } from '@/lib/types/dashboard';

interface Props {
  enrolledClasses: number;
  deadlinesCount: number;
  pendingCount: number;
  deadlineItems: DeadlineItem[];
  todoItems: StudentTodoItem[];
  personalTasks: PersonalTaskItem[];
}

export default function StudentStatCardsClient({
  enrolledClasses,
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
          { label: 'My classes', value: enrolledClasses, icon: BookOpen, tone: 'red', href: '/student/classes' },
          {
            label: 'Deadlines (next 7 days)',
            value: deadlinesCount,
            icon: CalendarIcon,
            tone: 'red',
            onClick: () => setOpen('deadlines'),
          },
          {
            label: 'Pending tasks',
            value: pendingCount,
            icon: ListChecks,
            tone: 'dark',
            onClick: () => setOpen('pending'),
          },
        ]}
      />

      {open === 'deadlines' && (
        <DeadlinesModal items={deadlineItems} role="student" onClose={() => setOpen(null)} />
      )}
      {open === 'pending' && (
        <PendingTasksModal
          role="student"
          todoItems={todoItems}
          personalTasks={personalTasks}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}