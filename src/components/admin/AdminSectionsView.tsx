'use client';

import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import type { AdminSectionRow } from '@/lib/actions/admin';
import { TRACKS, GRADE_LEVELS } from '@/types/class';
import { cn } from '@/lib/utils/cn';

export default function AdminSectionsView({
  sections,
}: {
  sections: AdminSectionRow[];
}) {
  const [query, setQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections.filter((s) => {
      if (trackFilter !== 'all' && s.track !== trackFilter) return false;
      if (gradeFilter !== 'all' && s.gradeLevel !== gradeFilter) return false;
      if (!q) return true;
      return (
        (s.section ?? '').toLowerCase().includes(q) ||
        (s.track ?? '').toLowerCase().includes(q) ||
        (s.gradeLevel ?? '').toLowerCase().includes(q) ||
        s.teacherNames.some((n) => n.toLowerCase().includes(q))
      );
    });
  }, [sections, query, trackFilter, gradeFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sections</h1>
          <p className="mt-1 text-sm text-gray-600">
            Sections grouped by name, grade level, and track across all classes.
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
          {filtered.length} of {sections.length}
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search section, track, teacher…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>

        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        >
          <option value="all">All grade levels</option>
          {GRADE_LEVELS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <select
          value={trackFilter}
          onChange={(e) => setTrackFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        >
          <option value="all">All tracks</option>
          {TRACKS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm italic text-gray-500">
          {sections.length === 0
            ? 'No sections yet. Sections appear once teachers create classes.'
            : 'No sections match your filters.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2.5">Section</th>
                  <th className="px-4 py-2.5">Grade level</th>
                  <th className="px-4 py-2.5">Track</th>
                  <th className="px-4 py-2.5">Teacher(s)</th>
                  <th className="px-4 py-2.5 text-right">Classes</th>
                  <th className="px-4 py-2.5 text-right">Students</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((s) => (
                  <tr key={s.key} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {s.section ?? (
                        <span className="italic text-gray-400">
                          No section name
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.gradeLevel ? (
                        <span className="text-gray-700">{s.gradeLevel}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.track ? (
                        <TrackPill track={s.track} />
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {s.teacherNames.length > 0
                        ? s.teacherNames.join(', ')
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                      {s.classCount}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                      {s.studentCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TrackPill({ track }: { track: string }) {
  const color: Record<string, string> = {
    ABM: 'bg-amber-100 text-amber-800',
    HUMSS: 'bg-sky-100 text-sky-800',
    'H.E': 'bg-rose-100 text-rose-800',
    ICT: 'bg-violet-100 text-violet-800',
  };
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
        color[track] ?? 'bg-gray-100 text-gray-700',
      )}
    >
      {track}
    </span>
  );
}