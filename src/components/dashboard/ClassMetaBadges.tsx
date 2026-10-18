// src/components/dashboard/ClassMetaBadges.tsx
import { GraduationCap, Layers, CalendarDays, Hash } from 'lucide-react';
import type { GradeLevel, Semester, Track } from '@/types/class';

// Color theming for each track. Distinct accent per track so a teacher
// scanning a list of classes can recognize tracks by color, not just text.
const TRACK_COLORS_ON_DARK: Record<Track, string> = {
  ABM: 'bg-emerald-500/25 ring-1 ring-inset ring-emerald-200/40 text-white backdrop-blur-sm',
  HUMSS: 'bg-rose-500/25 ring-1 ring-inset ring-rose-200/40 text-white backdrop-blur-sm',
  'H.E': 'bg-amber-500/25 ring-1 ring-inset ring-amber-200/40 text-white backdrop-blur-sm',
  ICT: 'bg-sky-500/25 ring-1 ring-inset ring-sky-200/40 text-white backdrop-blur-sm',
};

// Light-surface equivalents: flat tinted chips, no ring.
const TRACK_COLORS_ON_LIGHT: Record<Track, string> = {
  ABM: 'bg-emerald-50 text-emerald-700',
  HUMSS: 'bg-rose-50 text-rose-700',
  'H.E': 'bg-amber-50 text-amber-800',
  ICT: 'bg-sky-50 text-sky-700',
};

interface ClassMetaBadgesProps {
  section?: string | null;
  gradeLevel?: GradeLevel | null;
  track?: Track | null;
  semester: Semester;
  /**
   * When 'on-light', render flat chips suitable for white card surfaces.
   * Default ('on-dark') renders translucent-white pills for use on top of
   * the class cover image / color banner.
   */
  variant?: 'on-dark' | 'on-light';
  /** Skips the section badge (e.g. when the section is already shown as a subtitle). */
  hideSection?: boolean;
  /** Smaller padding + text for dense card grids. */
  size?: 'sm' | 'md';
}

/**
 * Class metadata badges: section (optional), grade level, track, semester.
 * Skips any badge whose value is null/undefined so partial data doesn't
 * render an empty pill.
 */
export default function ClassMetaBadges({
  section,
  gradeLevel,
  track,
  semester,
  variant = 'on-dark',
  hideSection = false,
  size = 'md',
}: ClassMetaBadgesProps) {
  const isLight = variant === 'on-light';

  const shape = isLight ? 'rounded-lg' : 'rounded-full';

  const baseBadge = isLight
    ? 'bg-stone-100 text-stone-600'
    : 'bg-white/20 text-white ring-1 ring-inset ring-white/30 backdrop-blur-sm';

  const trackBadge = track
    ? isLight
      ? TRACK_COLORS_ON_LIGHT[track]
      : TRACK_COLORS_ON_DARK[track]
    : '';

  const sizeClass =
    size === 'sm'
      ? 'px-2.5 py-1 text-[11.5px] gap-1'
      : 'px-2.5 py-1 text-xs gap-1.5';

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3 w-3';

  const badge = `inline-flex items-center font-semibold ${shape} ${sizeClass}`;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!hideSection && section && (
        <span className={`${badge} ${baseBadge}`} title="Section">
          <Hash className={`${iconSize} opacity-70`} />
          {section}
        </span>
      )}
      {gradeLevel && (
        <span className={`${badge} ${baseBadge}`} title="Grade level">
          <GraduationCap className={`${iconSize} opacity-70`} />
          {gradeLevel}
        </span>
      )}
      {track && (
        <span className={`${badge} ${trackBadge}`} title="Track">
          <Layers className={`${iconSize} opacity-80`} />
          {track}
        </span>
      )}
      <span className={`${badge} ${baseBadge}`} title="Semester">
        <CalendarDays className={`${iconSize} opacity-70`} />
        {semester}
      </span>
    </div>
  );
}