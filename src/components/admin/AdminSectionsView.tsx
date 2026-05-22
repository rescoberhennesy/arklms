'use client';

import { useState, useMemo } from 'react';
import { Search, ChevronRight, ChevronDown, Users } from 'lucide-react';
import type { AdminSectionRow } from '@/lib/actions/admin';
import { TRACKS, GRADE_LEVELS } from '@/types/class';
import { TrackPill } from '@/components/admin/TrackPill';
import { getInitials } from '@/lib/utils/getInitials';

export default function AdminSectionsView({
  sections,
}: {
  sections: AdminSectionRow[];
}) {
  const [query, setQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
        s.teacherNames.some((n) => n.toLowerCase().includes(q)) ||
        s.students.some(
          (st) =>
            (st.fullName ?? '').toLowerCase().includes(q) ||
            st.email.toLowerCase().includes(q),
        )
      );
    });
  }, [sections, query, trackFilter, gradeFilter]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sections</h1>
          <p className="mt-1 text-sm text-gray-600">
            Sections grouped by name, grade level, and track across all classes.
            Click a row to see the students enrolled in it.
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
            placeholder="Search section, track, teacher, student…"
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
                  <th className="w-8 px-2 py-2.5" aria-label="Expand" />
                  <th className="px-4 py-2.5">Section</th>
                  <th className="px-4 py-2.5">Grade level</th>
                  <th className="px-4 py-2.5">Track</th>
                  <th className="px-4 py-2.5">Teacher(s)</th>
                  <th className="px-4 py-2.5 text-right">Classes</th>
                  <th className="px-4 py-2.5 text-right">Students</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((s) => {
                  const isOpen = expanded.has(s.key);
                  return (
                    <SectionRow
                      key={s.key}
                      section={s}
                      isOpen={isOpen}
                      onToggle={() => toggle(s.key)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionRow({
  section,
  isOpen,
  onToggle,
}: {
  section: AdminSectionRow;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer hover:bg-gray-50/60"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <td className="px-2 py-2.5 text-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
            aria-label={isOpen ? 'Collapse section' : 'Expand section'}
          >
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="px-4 py-2.5 font-medium text-gray-900">
          {section.section ?? (
            <span className="italic text-gray-400">No section name</span>
          )}
        </td>
        <td className="px-4 py-2.5">
          {section.gradeLevel ? (
            <span className="text-gray-700">{section.gradeLevel}</span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-2.5">
          {section.track ? (
            <TrackPill track={section.track} />
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-gray-600">
          {section.teacherNames.length > 0
            ? section.teacherNames.join(', ')
            : '—'}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
          {section.classCount}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
          {section.studentCount}
        </td>
      </tr>

      {isOpen && (
        <tr className="bg-gray-50/40">
          <td colSpan={7} className="px-4 py-3">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <Users className="h-3.5 w-3.5" />
                Students in this section ({section.studentCount})
              </div>
              {section.students.length === 0 ? (
                <p className="text-sm italic text-gray-400">
                  No students enrolled yet.
                </p>
              ) : (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {section.students.map((st) => (
                    <li
                      key={st.id}
                      className="flex items-center gap-2.5 rounded-md border border-gray-100 bg-gray-50/50 px-3 py-2"
                    >
                      <StudentAvatar
                        url={st.avatarUrl}
                        name={st.fullName ?? st.email}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-gray-900">
                          {st.fullName ?? (
                            <span className="italic text-gray-400">
                              No name
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                          {st.email}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function StudentAvatar({
  url,
  name,
}: {
  url: string | null;
  name: string;
}) {
  if (url) {
    return (
      <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-gray-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name} className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-[11px] font-semibold text-red-700">
      {getInitials(name)}
    </span>
  );
}