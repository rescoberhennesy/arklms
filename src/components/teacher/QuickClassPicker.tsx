// src/components/teacher/QuickClassPicker.tsx
//
// Shared intermediate UI for the dashboard Quick Actions that need a
// class context. The teacher arrives here with a target action in mind
// (create activity / create module / post announcement); the picker
// lists their active classes as cards; clicking a card routes to the
// class's matching page with the `?create=1` query param so the
// destination auto-opens its inline composer.
//
// Used by /teacher/quick/activity, /teacher/quick/module,
// /teacher/quick/announce.
//
// Note: server-component callers can't pass a function across the
// RSC boundary, so the destination URL is given as a pattern string
// with `{classId}` placeholder, substituted client-side.

'use client';

import Link from 'next/link';
import { useState, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Search, Users } from 'lucide-react';
import {
  TRACKS,
  GRADE_LEVELS,
  DEFAULT_CLASS_COLOR,
  type TeacherClassListItem,
} from '@/types/class';

interface QuickClassPickerProps {
  title: string;
  description: string;
  classes: TeacherClassListItem[];
  // URL pattern containing the literal substring "{classId}", which
  // the picker substitutes at click time. e.g.
  //   "/teacher/classes/{classId}?tab=activities&create=1"
  hrefPattern: string;
}

export default function QuickClassPicker({
  title,
  description,
  classes,
  hrefPattern,
}: QuickClassPickerProps) {
  const [filter, setFilter] = useState('');
  const [track, setTrack] = useState('');
  const [grade, setGrade] = useState('');

  // Active classes only. Archived classes shouldn't be candidates for
  // new activities / modules / announcements.
  const active = useMemo(() => classes.filter((c) => !c.is_archived), [classes]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return active.filter((c) => {
      if (track && c.track !== track) return false;
      if (grade && c.grade_level !== grade) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.section ?? '').toLowerCase().includes(q) ||
        c.semester.toLowerCase().includes(q)
      );
    });
  }, [active, filter, track, grade]);

  function buildHref(classId: string): string {
    return hrefPattern.replace('{classId}', classId);
  }

  const selectClass =
    'h-10 rounded-lg border border-zinc-200 bg-white px-3 text-[13px] text-zinc-700 focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        </div>
        <Link
          href="/teacher/dashboard"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:bg-zinc-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Cancel
        </Link>
      </div>

      {active.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <p className="text-sm text-zinc-500">You don&apos;t have any active classes yet.</p>
          <Link
            href="/teacher/classes?create=1"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            Create your first class
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <>
          {/* Search + filters */}
          <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center">
            <label className="relative block flex-1">
              <span className="sr-only">Search classes</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search classes"
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10"
              />
            </label>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <label>
                <span className="sr-only">Track</span>
                <select value={track} onChange={(e) => setTrack(e.target.value)} className={`${selectClass} w-full sm:w-36`}>
                  <option value="">All tracks</option>
                  {TRACKS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Grade level</span>
                <select value={grade} onChange={(e) => setGrade(e.target.value)} className={`${selectClass} w-full sm:w-36`}>
                  <option value="">All grades</option>
                  {GRADE_LEVELS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between px-1 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400">
            <span>Choose a class</span>
            <span>{visible.length}</span>
          </div>

          {visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500">
              No classes match your search.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((cls) => {
                const color = cls.color ?? DEFAULT_CLASS_COLOR;
                return (
                  <Link
                    key={cls.id}
                    href={buildHref(cls.id)}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/15"
                  >
                    {/* Class color accent */}
                    <span className="h-1.5 w-full" style={{ backgroundColor: color }} />

                    <div className="flex flex-1 flex-col p-4">
                      <div className="flex items-start gap-3">
                        <span
                          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-[15px] font-bold text-zinc-900">{cls.name}</h3>
                          <p className="truncate text-xs text-zinc-500">{cls.section ?? '—'}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {cls.track && (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
                            {cls.track}
                          </span>
                        )}
                        {cls.grade_level && (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
                            {cls.grade_level}
                          </span>
                        )}
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          {cls.semester}
                        </span>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3">
                        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                          <Users className="h-3.5 w-3.5" />
                          {cls.enrolled_count} {cls.enrolled_count === 1 ? 'student' : 'students'}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-400 transition group-hover:text-red-600">
                          Select
                          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}