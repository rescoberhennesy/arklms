'use client';

// Left-hand class picker used by the teacher shortcut pages
// (Modules, Activities, Grades, Analytics).
// Selecting a class sets ?classId= on the current page.
// Optional "All classes" item (Analytics overview) clears it.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import {
  TRACKS,
  GRADE_LEVELS,
  DEFAULT_CLASS_COLOR,
  type TeacherClassListItem,
} from '@/types/class';

interface ShortcutClassPickerProps {
  classes: TeacherClassListItem[];
  /** Selected class id, or '' when the "All classes" item is selected. */
  selectedId: string;
  /** Small right-aligned label per class, e.g. "2 modules". */
  metaByClassId?: Record<string, string>;
  /** Classes whose meta label should be shown in red (needs attention). */
  alertByClassId?: Record<string, boolean>;
  /** When set, shows an "All classes" item at the top with this subtitle. */
  allItemSubtitle?: string;
}

export default function ShortcutClassPicker({
  classes,
  selectedId,
  metaByClassId = {},
  alertByClassId = {},
  allItemSubtitle,
}: ShortcutClassPickerProps) {
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [track, setTrack] = useState('');
  const [grade, setGrade] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return classes.filter((c) => {
      if (track && c.track !== track) return false;
      if (grade && c.grade_level !== grade) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.section ?? '').toLowerCase().includes(q)
      );
    });
  }, [classes, query, track, grade]);

  const selectClass =
    'w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-[13px] text-zinc-700 focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10';

  const rowBase = 'flex items-center gap-3 rounded-xl px-3 py-2.5 transition';
  const rowActive = 'bg-red-50 ring-1 ring-inset ring-red-200';

  return (
    <aside className="space-y-2.5 rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <label className="relative block">
        <span className="sr-only">Search classes</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search classes"
          className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10"
        />
      </label>

      <div className="grid grid-cols-2 gap-1.5">
        <label>
          <span className="sr-only">Track</span>
          <select value={track} onChange={(e) => setTrack(e.target.value)} className={selectClass}>
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
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className={selectClass}>
            <option value="">All grades</option>
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between px-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400">
        <span>Your classes</span>
        <span>{visible.length}</span>
      </div>

      <nav aria-label="Classes" className="space-y-0.5">
        {allItemSubtitle !== undefined && (
          <>
            <Link
              href={pathname}
              aria-current={selectedId === '' ? 'true' : undefined}
              className={`${rowBase} ${selectedId === '' ? rowActive : 'hover:bg-zinc-50'}`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-zinc-900" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-zinc-900">All classes</span>
                <span className="block truncate text-xs text-zinc-500">{allItemSubtitle}</span>
              </span>
              <span className="shrink-0 text-xs text-zinc-400">{classes.length}</span>
            </Link>
            <div className="mx-2 my-1 h-px bg-zinc-100" />
          </>
        )}

        {visible.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-zinc-500">No classes match.</p>
        ) : (
          visible.map((c) => {
            const active = c.id === selectedId;
            return (
              <Link
                key={c.id}
                href={`${pathname}?classId=${c.id}`}
                aria-current={active ? 'true' : undefined}
                className={`${rowBase} ${active ? rowActive : 'hover:bg-zinc-50'}`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color ?? DEFAULT_CLASS_COLOR }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-zinc-900">{c.name}</span>
                  <span className="block truncate text-xs text-zinc-500">{c.section ?? '—'}</span>
                </span>
                {metaByClassId[c.id] && (
                  <span
                    className={`shrink-0 text-xs ${
                      alertByClassId[c.id] ? 'font-bold text-red-600' : 'text-zinc-400'
                    }`}
                  >
                    {metaByClassId[c.id]}
                  </span>
                )}
              </Link>
            );
          })
        )}
      </nav>
    </aside>
  );
}