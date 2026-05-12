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
import { ArrowLeft, Search } from 'lucide-react';
import ClassCover from '@/components/dashboard/ClassCover';
import type { TeacherClassListItem } from '@/types/class';

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

  // Active classes only. Archived classes shouldn't be candidates for
  // new activities / modules / announcements.
  const visible = useMemo(() => {
    const active = classes.filter((c) => !c.is_archived);
    const q = filter.trim().toLowerCase();
    if (!q) return active;
    return active.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.section ?? '').toLowerCase().includes(q) ||
        c.semester.toLowerCase().includes(q),
    );
  }, [classes, filter]);

  function buildHref(classId: string): string {
    return hrefPattern.replace('{classId}', classId);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
        </div>
        <Link
          href="/teacher/dashboard"
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Cancel
        </Link>
      </div>

      {classes.filter((c) => !c.is_archived).length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
          <p className="text-sm text-gray-600">
            You don&apos;t have any active classes yet.
          </p>
          <Link
            href="/teacher/classes?create=1"
            className="mt-3 inline-block text-sm font-medium text-red-600 hover:text-red-700"
          >
            Create your first class →
          </Link>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter classes…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
              No classes match &ldquo;{filter}&rdquo;.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((cls) => (
                <Link
                  key={cls.id}
                  href={buildHref(cls.id)}
                  className="block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:border-red-300 hover:shadow-md"
                >
                  <ClassCover
                    url={cls.cover_photo_url}
                    color={cls.color}
                    className="h-24 w-full"
                  >
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <h3 className="truncate text-base font-semibold text-white drop-shadow-sm">
                        {cls.name}
                      </h3>
                      {cls.section && (
                        <p className="truncate text-xs text-white/90 drop-shadow-sm">
                          {cls.section}
                        </p>
                      )}
                    </div>
                  </ClassCover>
                  <div className="flex items-center justify-between p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      {cls.semester}
                    </p>
                    <p className="text-xs text-gray-600">
                      {cls.enrolled_count}{' '}
                      {cls.enrolled_count === 1 ? 'student' : 'students'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}