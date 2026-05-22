// src/components/dashboard/PendingTasksModal.tsx
// Shows the items that count toward "Pending Tasks". Combines two sources:
//   1. Role-specific todo items (TeacherTodoItem or StudentTodoItem)
//   2. Personal tasks (same shape for both roles)
// Both render as clickable rows that route to the relevant place.

'use client';

import Link from 'next/link';
import {
  ClipboardCheck,
  ClipboardList,
  FileText,
  Calendar,
  CheckSquare,
} from 'lucide-react';
import StatCardModal from './StatCardModal';
import type {
  TeacherTodoItem,
  StudentTodoItem,
} from '@/lib/types/dashboard';
import type { PersonalTaskItem } from '@/lib/types/dashboard';

interface BaseProps {
  personalTasks: PersonalTaskItem[];
  onClose: () => void;
}

interface TeacherProps extends BaseProps {
  role: 'teacher';
  todoItems: TeacherTodoItem[];
}

interface StudentProps extends BaseProps {
  role: 'student';
  todoItems: StudentTodoItem[];
}

type Props = TeacherProps | StudentProps;

export default function PendingTasksModal(props: Props) {
  const total = props.todoItems.length + props.personalTasks.length;

  return (
    <StatCardModal
      title="Pending tasks"
      subtitle={`${total} item${total === 1 ? '' : 's'} need your attention`}
      onClose={props.onClose}
    >
      {total === 0 ? (
        <div className="py-8 text-center text-sm italic text-slate-500">
          You're all caught up.
        </div>
      ) : (
        <div className="space-y-4">
          {props.todoItems.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {props.role === 'teacher' ? 'Grading & class' : 'Coursework'}
              </h3>
              <ul className="space-y-2">
                {props.role === 'teacher'
                  ? props.todoItems.map((item) => (
                      <TeacherTodoRow
                        key={`${item.kind}-${item.submissionId ?? item.attemptId ?? item.activityId}`}
                        item={item}
                        onClose={props.onClose}
                      />
                    ))
                  : props.todoItems.map((item) => (
                      <StudentTodoRow
                        key={item.activityId}
                        item={item}
                        onClose={props.onClose}
                      />
                    ))}
              </ul>
            </section>
          )}

          {props.personalTasks.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Personal tasks
              </h3>
              <ul className="space-y-2">
                {props.personalTasks.map((task) => (
                  <PersonalTaskRow
                    key={task.id}
                    task={task}
                    onClose={props.onClose}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </StatCardModal>
  );
}

// ---------- Row variants ---------------------------------------------------

function TeacherTodoRow({
  item,
  onClose,
}: {
  item: TeacherTodoItem;
  onClose: () => void;
}) {
  const meta = teacherTodoMeta(item);
  return (
    <li>
      <Link
        href={meta.href}
        onClick={onClose}
        className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-indigo-200 hover:bg-indigo-50/30"
      >
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${meta.tint}`}>
          <meta.Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">
            {meta.title}
          </p>
          <p className="truncate text-xs text-slate-500">{meta.subtitle}</p>
        </div>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {meta.tag}
        </span>
      </Link>
    </li>
  );
}

function StudentTodoRow({
  item,
  onClose,
}: {
  item: StudentTodoItem;
  onClose: () => void;
}) {
  const Icon = item.activityKind === 'quiz' ? ClipboardList : FileText;
  const href = `/student/classes/${item.classId}/activities/${item.activityId}`;
  const tag = item.isOverdue
    ? 'Overdue'
    : item.quizState === 'in_progress'
      ? 'Resume'
      : 'Do it';
  const tagColor = item.isOverdue ? 'text-red-600' : 'text-slate-400';

  return (
    <li>
      <Link
        href={href}
        onClick={onClose}
        className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-indigo-200 hover:bg-indigo-50/30"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-700">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">
            {item.title}
          </p>
          <p className="truncate text-xs text-slate-500">{item.className}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${tagColor}`}>
          {tag}
        </span>
      </Link>
    </li>
  );
}

function PersonalTaskRow({
  task,
  onClose,
}: {
  task: PersonalTaskItem;
  onClose: () => void;
}) {
  // Personal tasks have no detail page — clicking closes the modal so the
  // user can interact with them in the PersonalTasksPanel below the fold.
  // If you ever add a personal-tasks page, swap this for a Link.
  return (
    <li>
      <button
        type="button"
        onClick={onClose}
        className="flex w-full items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
          <CheckSquare className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">
            {task.title}
          </p>
          {task.dueAt && (
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Calendar className="h-3 w-3" />
              Due {new Date(task.dueAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </button>
    </li>
  );
}

// ---------- Helpers --------------------------------------------------------

function teacherTodoMeta(item: TeacherTodoItem) {
  switch (item.kind) {
    case 'submission_ungraded':
      return {
        Icon: ClipboardCheck,
        tint: 'bg-amber-50 text-amber-700',
        title: item.activityTitle,
        subtitle: `${item.className} · ${item.studentName ?? item.studentEmail ?? 'Student'}`,
        tag: item.isDraftGrade ? 'Draft' : 'Grade',
        href: item.submissionId
          ? `/teacher/classes/${item.classId}/activities/${item.activityId}/submissions/${item.submissionId}`
          : `/teacher/classes/${item.classId}/activities/${item.activityId}`,
      };
    case 'quiz_manual_pending':
      return {
        Icon: ClipboardList,
        tint: 'bg-amber-50 text-amber-700',
        title: item.activityTitle,
        subtitle: `${item.className} · ${item.studentName ?? item.studentEmail ?? 'Student'}`,
        tag: 'Review',
        href: item.attemptId
          ? `/teacher/classes/${item.classId}/activities/${item.activityId}/attempts/${item.attemptId}`
          : `/teacher/classes/${item.classId}/activities/${item.activityId}`,
      };
    case 'class_deadline':
      return {
        Icon: Calendar,
        tint: 'bg-indigo-50 text-indigo-700',
        title: item.activityTitle,
        subtitle: item.className,
        tag: 'Due',
        href: `/teacher/classes/${item.classId}/activities/${item.activityId}`,
      };
  }
}