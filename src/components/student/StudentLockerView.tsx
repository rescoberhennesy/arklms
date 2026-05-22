'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Archive,
  FileText,
  ClipboardList,
  Paperclip,
  Clock,
} from 'lucide-react';
import type { LockerSubmissionRow } from '@/lib/actions/activities';

const STATUS_META: Record <
  LockerSubmissionRow['status'],
  { label: string; className: string }
> = {
  draft: {
    label: 'Draft',
    className: 'bg-gray-100 text-gray-700',
  },
  submitted: {
    label: 'Submitted',
    className: 'bg-blue-50 text-blue-700',
  },
  late_submitted: {
    label: 'Submitted (late)',
    className: 'bg-amber-50 text-amber-700',
  },
  graded_returned: {
    label: 'Graded',
    className: 'bg-green-50 text-green-700',
  },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function StudentLockerView({
  submissions,
}: {
  submissions: LockerSubmissionRow[];
}) {
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Build unique class list for the filter dropdown
  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of submissions) {
      if (!seen.has(s.classId)) seen.set(s.classId, s.className);
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [submissions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return submissions.filter((s) => {
      if (classFilter !== 'all' && s.classId !== classFilter) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.activityTitle.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q)
      );
    });
  }, [submissions, query, classFilter, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Archive className="h-6 w-6 text-red-600" />
            Locker
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Everything you&apos;ve submitted across your classes.
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
          {filtered.length} of {submissions.length}
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by activity or class…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        >
          <option value="all">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        >
          <option value="all">All statuses</option>
          <option value="submitted">Submitted</option>
          <option value="late_submitted">Submitted (late)</option>
          <option value="graded_returned">Graded</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {/* Empty state */}
      {submissions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-12 text-center">
          <Archive className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-700">
            Your locker is empty
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Once you submit work to your classes, it will appear here.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm italic text-gray-500">
          No submissions match your filters.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((s) => (
            <LockerRow key={s.submissionId} sub={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LockerRow({ sub }: { sub: LockerSubmissionRow }) {
  const status = STATUS_META[sub.status];
  const Icon = sub.activityKind === 'quiz' ? ClipboardList : FileText;
  const href = `/student/classes/${sub.classId}/activities/${sub.activityId}`;

  return (
    <li>
      <Link
        href={href}
        className="group flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-red-200 hover:shadow-md"
      >
        {/* Activity icon + class color stripe */}
        <div className="flex shrink-0 items-center gap-3">
          <span
            className="h-10 w-1 rounded-full"
            style={{ backgroundColor: sub.classColor ?? '#e5e7eb' }}
            aria-hidden="true"
          />
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 text-gray-600">
            <Icon className="h-5 w-5" />
          </span>
        </div>

        {/* Main */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900 group-hover:text-red-700">
                {sub.activityTitle}
              </p>
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {sub.className}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}
            >
              {status.label}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(sub.submittedAt)}
            </span>
            {sub.attachmentCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                {sub.attachmentCount} file
                {sub.attachmentCount === 1 ? '' : 's'}
              </span>
            )}
            {sub.attemptNumber > 1 && (
              <span className="text-gray-400">
                Attempt #{sub.attemptNumber}
              </span>
            )}
            {sub.status === 'graded_returned' && sub.score !== null && (
              <span className="font-semibold text-green-700">
                {sub.score} / {sub.maxPoints}
              </span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}