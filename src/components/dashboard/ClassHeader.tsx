// src/components/dashboard/ClassHeader.tsx
//
// Shared dark class header used by both the teacher and student class pages.
// - Dark surface that matches the sidebar.
// - Class color shows as a dot beside the section + soft glow circles.
// - If the class has a cover photo, it is shown faded under a dark overlay.
// - Role-specific buttons (Settings / Leave class) come in via `actions`.
import type { ReactNode } from 'react';
import { User } from 'lucide-react';
import {
  DEFAULT_CLASS_COLOR,
  type GradeLevel,
  type Semester,
  type Track,
} from '@/types/class';
import ClassMetaBadges from '@/components/dashboard/ClassMetaBadges';
import ClassDescription from '@/components/dashboard/ClassDescription';

interface ClassHeaderProps {
  name: string;
  section?: string | null;
  gradeLevel?: GradeLevel | null;
  track?: Track | null;
  semester: Semester;
  color?: string | null;
  coverPhotoUrl?: string | null;
  /** Student view only: shows "Teacher: <name>" under the badges. */
  teacherName?: string | null;
  /** Buttons on the right (e.g. Settings for teachers, Leave for students). */
  actions?: ReactNode;
    /** Optional class description, shown under the badges. */
  description?: string | null;
}

export default function ClassHeader({
  name,
  section,
  gradeLevel,
  track,
  semester,
  color,
  coverPhotoUrl,
  teacherName,
  actions,
  description
}: ClassHeaderProps) {
  const accent = color ?? DEFAULT_CLASS_COLOR;

  return (
    <section className="relative overflow-hidden rounded-[22px] bg-[#141416] px-6 py-7 shadow-[0_12px_32px_rgba(12,12,13,0.18)] sm:px-8">
      {coverPhotoUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverPhotoUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-[#141416] via-[#141416]/85 to-[#141416]/40"
          />
        </>
      ) : (
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1200 170"
          preserveAspectRatio="xMaxYMid slice"
        >
          <circle cx="1100" cy="20" r="150" fill={accent} fillOpacity="0.16" />
          <circle cx="1100" cy="20" r="90" fill={accent} fillOpacity="0.14" />
          <circle cx="930" cy="190" r="70" fill={accent} fillOpacity="0.08" />
        </svg>
      )}

      <div className="relative flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-1 basis-[320px] space-y-3">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-2 text-[13px] font-bold tracking-[0.06em] text-zinc-300">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: accent,
                  boxShadow: `0 0 0 4px color-mix(in oklab, ${accent} 22%, transparent)`,
                }}
              />
              {section}
            </span>
            <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-white sm:text-[34px]">
              {name}
            </h1>
          </div>

          {/* Section is already shown above the title, so hide it here. */}
          <ClassMetaBadges
            gradeLevel={gradeLevel}
            track={track}
            semester={semester}
            variant="on-dark"
            hideSection
          />

                    {description?.trim() && <ClassDescription text={description.trim()} />}

          {teacherName && (
            <p className="inline-flex items-center gap-1.5 text-sm text-zinc-400">
              <User className="h-3.5 w-3.5" />
              <span>
                Teacher:{' '}
                <span className="font-semibold text-zinc-100">{teacherName}</span>
              </span>
            </p>
          )}
        </div>

        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </section>
  );
}