'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Archive,
  ClipboardList,
  ListChecks,
  Paperclip,
  ChevronRight,
} from 'lucide-react';
import type { LockerSubmissionRow } from '@/lib/actions/activities';
import { standingOf, type Standing } from '@/lib/utils/grading';

type Filter = 'all' | 'graded' | 'waiting' | 'draft';

const PASSING = 75; // default passing grade for score colors

const SCORE_CLS: Record<Standing, string> = {
  pass: 'bg-emerald-50 text-emerald-700',
  near: 'bg-amber-50 text-amber-700',
  risk: 'bg-red-50 text-red-700',
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function matchesFilter(s: LockerSubmissionRow, f: Filter): boolean {
  if (f === 'graded') return s.status === 'graded_returned';
  if (f === 'waiting') return s.status === 'submitted' || s.status === 'late_submitted';
  if (f === 'draft') return s.status === 'draft';
  return true;
}

export default function StudentLockerView({ submissions }: { submissions: LockerSubmissionRow[] }) {
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [filter, setFilter] = useState<Filter>('all');

  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of submissions) if (!seen.has(s.classId)) seen.set(s.classId, s.className);
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [submissions]);

  // Stats (ignore drafts)
  const finals = submissions.filter((s) => s.status !== 'draft');
  const graded = submissions.filter((s) => s.status === 'graded_returned' && s.score !== null && s.maxPoints > 0);
  const waiting = submissions.filter((s) => s.status === 'submitted' || s.status === 'late_submitted');
  const average = graded.length
    ? graded.reduce((sum, s) => sum + ((s.score as number) / s.maxPoints) * 100, 0) / graded.length
    : null;

  const counts: Record<Filter, number> = {
    all: submissions.length,
    graded: graded.length,
    waiting: waiting.length,
    draft: submissions.filter((s) => s.status === 'draft').length,
  };

  // Filter + group by class (newest first inside each class)
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = submissions.filter((s) => {
      if (classFilter !== 'all' && s.classId !== classFilter) return false;
      if (!matchesFilter(s, filter)) return false;
      if (!q) return true;
      return s.activityTitle.toLowerCase().includes(q) || s.className.toLowerCase().includes(q);
    });
    const byClass = new Map<string, { name: string; color: string | null; items: LockerSubmissionRow[] }>();
    for (const s of rows) {
      const g = byClass.get(s.classId) ?? { name: s.className, color: s.classColor, items: [] };
      g.items.push(s);
      byClass.set(s.classId, g);
    }
    return Array.from(byClass.entries())
      .map(([id, g]) => ({
        id,
        ...g,
        items: g.items.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || '')),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [submissions, query, classFilter, filter]);

  const visibleCount = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-zinc-900">
          <Archive className="h-6 w-6 text-red-600" />
          Locker
        </h1>
        <p className="mt-1 text-sm text-zinc-500">Everything you&apos;ve submitted across your classes.</p>
      </div>

      {submissions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <Archive className="h-6 w-6" />
          </span>
          <p className="text-base font-bold text-zinc-900">Your locker is empty</p>
          <p className="text-sm text-zinc-500">Once you submit work to your classes, it will appear here.</p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Submitted" value={String(finals.length)} />
            <Stat label="Graded" value={String(graded.length)} tone="text-emerald-700" />
            <Stat label="Waiting for grade" value={String(waiting.length)} />
            <Stat label="Average score" value={average === null ? '—' : `${Math.round(average)}%`} />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap gap-1">
              {(
                [
                  ['all', 'All'],
                  ['graded', 'Graded'],
                  ['waiting', 'Waiting'],
                  ['draft', 'Drafts'],
                ] as const
              ).map(([key, label]) => {
                const active = filter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`rounded-lg px-3 py-1.5 text-[13px] transition ${
                      active ? 'bg-zinc-900 font-semibold text-white' : 'font-medium text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    {label} <span className={active ? 'text-white/60' : 'text-zinc-400'}>{counts[key]}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <label className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                <span className="sr-only">Search</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-sm placeholder:text-zinc-400 focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10"
                />
              </label>
              {classes.length > 1 && (
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-700 focus:border-red-400 focus:outline-none"
                >
                  <option value="all">All classes</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Groups */}
          {visibleCount === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-500">
              Nothing here.
            </p>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <section
                  key={g.id}
                  className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-zinc-600">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color ?? '#a1a1aa' }} />
                    {g.name}
                    <span className="font-normal text-zinc-400">
                      · {g.items.length} item{g.items.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
                    {g.items.map((s) => (
                      <LockerRow key={s.submissionId} sub={s} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
      <p className={`text-xl font-bold ${tone ?? 'text-zinc-900'}`}>{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

function LockerRow({ sub }: { sub: LockerSubmissionRow }) {
  const isQuiz = sub.activityKind === 'quiz';
  const href = `/student/classes/${sub.classId}/activities/${sub.activityId}`;
  const pct = sub.score !== null && sub.maxPoints > 0 ? (sub.score / sub.maxPoints) * 100 : null;

  let pill: { label: string; cls: string };
  if (sub.status === 'graded_returned') pill = { label: 'Graded', cls: 'bg-emerald-50 text-emerald-700' };
  else if (sub.status === 'draft') pill = { label: 'Draft · continue', cls: 'bg-amber-50 text-amber-700' };
  else pill = { label: 'Waiting for grade', cls: 'bg-zinc-100 text-zinc-600' };

  return (
    <li>
      <Link href={href} className="group flex items-center gap-3 px-4 py-3 transition hover:bg-zinc-50">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            isQuiz ? 'bg-purple-50 text-purple-600' : 'bg-red-50 text-red-600'
          }`}
        >
          {isQuiz ? <ListChecks className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-zinc-900 group-hover:text-red-700">{sub.activityTitle}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
            <span>
              {isQuiz ? 'Quiz' : 'Activity'}
              {sub.status === 'draft' ? ' · last saved' : ' · submitted'} {fmtDateTime(sub.submittedAt)}
            </span>
            {sub.isLate && <span className="font-semibold text-amber-700">Late</span>}
            {sub.attachmentCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                {sub.attachmentCount} file{sub.attachmentCount === 1 ? '' : 's'}
              </span>
            )}
            {sub.attemptNumber > 1 && <span>Attempt {sub.attemptNumber}</span>}
          </p>
        </div>

        {pct !== null && (
          <span
            className={`hidden whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-bold sm:inline-flex ${
              SCORE_CLS[standingOf(pct, PASSING)]
            }`}
          >
            {sub.score}/{sub.maxPoints} · {Math.round(pct)}%
          </span>
        )}
        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${pill.cls}`}>{pill.label}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
      </Link>
    </li>
  );
}