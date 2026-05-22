// src/components/dashboard/DeadlinesModal.tsx
// Shows the items that count toward the "Deadlines (7d)" stat. Each row
// links to the activity page for the caller's role.

'use client';

import Link from 'next/link';
import { Calendar, FileText, ClipboardList } from 'lucide-react';
import StatCardModal from './StatCardModal';
import type { DeadlineItem } from '@/lib/actions/dashboard';

interface Props {
  items: DeadlineItem[];
  role: 'teacher' | 'student';
  onClose: () => void;
}

export default function DeadlinesModal({ items, role, onClose }: Props) {
  return (
    <StatCardModal
      title="Deadlines this week"
      subtitle={`${items.length} item${items.length === 1 ? '' : 's'} due in the next 7 days`}
      onClose={onClose}
    >
      {items.length === 0 ? (
        <div className="py-8 text-center text-sm italic text-slate-500">
          Nothing due in the next 7 days.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const href =
              role === 'teacher'
                ? `/teacher/classes/${item.classId}/activities/${item.activityId}`
                : `/student/classes/${item.classId}/activities/${item.activityId}`;
            const Icon = item.activityKind === 'quiz' ? ClipboardList : FileText;
            return (
              <li key={item.activityId}>
                <Link
                  href={href}
                  onClick={onClose}
                  className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-red-200 hover:bg-red-50/30"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {item.title}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {item.className}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                    <Calendar className="h-3 w-3" />
                    {formatDue(item.dueAt)}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </StatCardModal>
  );
}

function formatDue(iso: string): string {
  const due = new Date(iso);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffHrs = Math.round(diffMs / (60 * 60_000));
  if (diffHrs < 1) return 'soon';
  if (diffHrs < 24) return `in ${diffHrs}h`;
  const diffDays = Math.round(diffHrs / 24);
  return `in ${diffDays}d`;
}