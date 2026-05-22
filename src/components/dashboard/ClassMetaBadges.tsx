// src/components/dashboard/ClassMetaBadges.tsx
import { GraduationCap, Layers, CalendarDays, Hash } from 'lucide-react';
import type { GradeLevel, Semester, Track } from '@/types/class';

// Color theming for each track. Distinct accent per track so a teacher
// scanning a list of classes can recognize tracks by color, not just text.
const TRACK_COLORS_ON_DARK: Record<Track, string> = {
  ABM: 'bg-emerald-500/25 ring-emerald-200/40 text-white',
  HUMSS: 'bg-rose-500/25 ring-rose-200/40 text-white',
  'H.E': 'bg-amber-500/25 ring-amber-200/40 text-white',
  ICT: 'bg-sky-500/25 ring-sky-200/40 text-white',
};

// Light-background equivalents for use on cards (white surface).
// Same hue family per track, just tuned for a light surface so text stays
// readable. Each track keeps its own "personality" between the banner and
// the card grid.
const TRACK_COLORS_ON_LIGHT: Record<Track, string> = {
  ABM: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  HUMSS: 'bg-rose-50 text-rose-700 ring-rose-200',
  'H.E': 'bg-amber-50 text-amber-800 ring-amber-200',
  ICT: 'bg-sky-50 text-sky-700 ring-sky-200',
};

interface ClassMetaBadgesProps {
  section?: string | null;
  gradeLevel?: GradeLevel | null;
  track?: Track | null;
  semester: Semester;
  /**
   * When true, render dark-on-light badges suitable for white card surfaces.
   * Default (false) renders translucent-white badges for use on top of the
   * class cover image / gradient banner.
   */
  variant?: 'on-dark' | 'on-light';
  /**
   * Skips rendering the section badge. Useful for cards where the section
   * already appears prominently (e.g. as a subtitle in the cover overlay),
   * to avoid duplicating it in the body.
   */
  hideSection?: boolean;
  /**
   * Smaller padding + text. Use on dense card grids where the standard
   * size would overwhelm the layout.
   */
  size?: 'sm' | 'md';
}

/**
 * Class metadata badges. Renders a flex-wrap row of pills showing the
 * structural information about a class: section (optional), grade level,
 * track, semester. Each badge has an icon for quick visual scan.
 *
 * Skips any badge whose value is null/undefined so partial data
 * (e.g. older classes without a track set) doesn't render an empty pill.
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

  const baseBadge = isLight
    ? 'bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200'
    : 'bg-white/20 text-white ring-1 ring-inset ring-white/30 backdrop-blur-sm';

  const trackBadge = track
    ? isLight
      ? `${TRACK_COLORS_ON_LIGHT[track]} ring-1 ring-inset`
      : `${TRACK_COLORS_ON_DARK[track]} ring-1 ring-inset backdrop-blur-sm`
    : '';

  const sizeClass =
    size === 'sm'
      ? 'px-2 py-0.5 text-[11px] gap-1'
      : 'px-2.5 py-1 text-xs gap-1.5';

  const iconSize = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3';

  return (
    <div
      className={
        size === 'sm' ? 'flex flex-wrap items-center gap-1.5' : 'flex flex-wrap items-center gap-2'
      }
    >
      {!hideSection && section && (
        <span
          className={`inline-flex items-center rounded-full font-medium ${sizeClass} ${baseBadge}`}
          title="Section"
        >
          <Hash className={`${iconSize} opacity-80`} />
          {section}
        </span>
      )}
      {gradeLevel && (
        <span
          className={`inline-flex items-center rounded-full font-medium ${sizeClass} ${baseBadge}`}
          title="Grade level"
        >
          <GraduationCap className={`${iconSize} opacity-80`} />
          {gradeLevel}
        </span>
      )}
      {track && (
        <span
          className={`inline-flex items-center rounded-full font-medium ${sizeClass} ${trackBadge}`}
          title="Track"
        >
          <Layers className={`${iconSize} opacity-90`} />
          {track}
        </span>
      )}
      <span
        className={`inline-flex items-center rounded-full font-medium ${sizeClass} ${baseBadge}`}
        title="Semester"
      >
        <CalendarDays className={`${iconSize} opacity-80`} />
        {semester}
      </span>
    </div>
  );
}