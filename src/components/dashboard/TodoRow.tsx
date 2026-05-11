// src/components/dashboard/TodoRow.tsx
//
// Shared row primitive for both StudentTodoWidget and TeacherTodoWidget.
// Keeps the visual layout (title + meta + chevron) consistent across both
// to-do widgets while letting each widget supply its own content semantics
// via children/props.

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

interface TodoRowProps {
  href: string;
  title: string;
  // Secondary line below the title — class name, due time, etc.
  // Provided as nodes so callers can include badges, colors, icons.
  meta: ReactNode;
  // Right-side cluster before the chevron — kind badge, status pill, etc.
  rightSlot?: ReactNode;
}

export default function TodoRow({ href, title, meta, rightSlot }: TodoRowProps) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition hover:border-red-300 hover:bg-red-50/40"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-900 group-hover:text-red-700">
          {title}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          {meta}
        </div>
      </div>
      {rightSlot && (
        <div className="flex shrink-0 items-center gap-1.5">{rightSlot}</div>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-red-500" />
    </Link>
  );
}