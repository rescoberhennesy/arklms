'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Filter, X } from 'lucide-react';
import { TRACKS, GRADE_LEVELS } from '@/types/class';
import type { TeacherClassListItem } from '@/types/class';

interface TeacherActivitiesFilterBarProps {
  classes: TeacherClassListItem[];
  matchedCount: number;
  totalCount: number;
}

/**
 * Filter bar for the aggregated /teacher/activities page.
 *
 * URL contract identical to TeacherGradesFilterBar:
 *   ?classId=  - pin to one class (shadows the other three)
 *   ?section=  - exact match
 *   ?track=    - exact match
 *   ?grade=    - exact match on grade_level
 *
 * Picking a class clears the group filters so the URL reflects state honestly.
 */
export default function TeacherActivitiesFilterBar({
  classes,
  matchedCount,
  totalCount,
}: TeacherActivitiesFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const currentClassId = searchParams.get('classId') ?? '';
  const currentSection = searchParams.get('section') ?? '';
  const currentTrack = searchParams.get('track') ?? '';
  const currentGrade = searchParams.get('grade') ?? '';

  const anyFilterActive =
    !!currentClassId || !!currentSection || !!currentTrack || !!currentGrade;

  const sectionOptions = Array.from(
    new Set(
      classes
        .map((c) => c.section)
        .filter((s): s is string => !!s && s.trim() !== ''),
    ),
  ).sort();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    if (key === 'classId' && value) {
      params.delete('section');
      params.delete('track');
      params.delete('grade');
    }
    // Note: we intentionally preserve ?completion= here so the user's
    // existing completion filter on the per-class ActivitiesTab survives
    // a class/section/track/grade change. If you want to reset it on
    // filter changes, params.delete('completion') here.
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function clearAll() {
    startTransition(() => {
      // Preserve completion filter on clear-all too; matches the param
      // policy above. If you'd rather wipe everything, use `pathname`.
      const params = new URLSearchParams(searchParams.toString());
      params.delete('classId');
      params.delete('section');
      params.delete('track');
      params.delete('grade');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  const groupFiltersDisabled = !!currentClassId;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Filter className="h-4 w-4 text-gray-500" />
          <span className="font-medium">Filters</span>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Class
          </span>
          <select
            value={currentClassId}
            onChange={(e) => setParam('classId', e.target.value)}
            disabled={pending}
            className="min-w-[200px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.section ? ` · ${c.section}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Section
          </span>
          <select
            value={currentSection}
            onChange={(e) => setParam('section', e.target.value)}
            disabled={pending || groupFiltersDisabled}
            className="min-w-[140px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          >
            <option value="">All sections</option>
            {sectionOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Track
          </span>
          <select
            value={currentTrack}
            onChange={(e) => setParam('track', e.target.value)}
            disabled={pending || groupFiltersDisabled}
            className="min-w-[120px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          >
            <option value="">All tracks</option>
            {TRACKS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Grade level
          </span>
          <select
            value={currentGrade}
            onChange={(e) => setParam('grade', e.target.value)}
            disabled={pending || groupFiltersDisabled}
            className="min-w-[130px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          >
            <option value="">All grades</option>
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          <span>
            {matchedCount} of {totalCount} {totalCount === 1 ? 'class' : 'classes'}
          </span>
          {anyFilterActive && (
            <button
              type="button"
              onClick={clearAll}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {groupFiltersDisabled && (
        <p className="mt-3 text-xs text-gray-500">
          Showing one specific class — section, track, and grade filters are
          ignored.
        </p>
      )}
    </div>
  );
}