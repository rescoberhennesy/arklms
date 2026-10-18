// src/components/dashboard/RichClassCard.tsx
//
// "Your classes" card on both dashboards. Matches the Classes page card:
// soft cover, title below, flat meta chips, footer line.

import Link from 'next/link';
import ClassCover from '@/components/dashboard/ClassCover';
import ClassMetaBadges from '@/components/dashboard/ClassMetaBadges';
import { DEFAULT_CLASS_COLOR } from '@/types/class';
import type { TeacherClassListItem, StudentClassListItem } from '@/types/class';

interface TeacherCardProps {
  role: 'teacher';
  cls: TeacherClassListItem;
}

interface StudentCardProps {
  role: 'student';
  cls: StudentClassListItem;
}

type RichClassCardProps = TeacherCardProps | StudentCardProps;

export default function RichClassCard(props: RichClassCardProps) {
  if (props.role === 'teacher') {
    const c = props.cls;
    return (
      <CardShell
        href={`/teacher/classes/${c.id}`}
        name={c.name}
        section={c.section}
        color={c.color}
        coverUrl={c.cover_photo_url}
        archived={c.is_archived}
        showActive
        badges={
          <ClassMetaBadges
            gradeLevel={c.grade_level}
            track={c.track}
            semester={c.semester}
            variant="on-light"
            size="sm"
            hideSection
          />
        }
        footer={
          c.enrolled_count === 0 ? (
            'No students yet'
          ) : (
            <>
              <b className="font-semibold text-zinc-900">{c.enrolled_count}</b>{' '}
              {c.enrolled_count === 1 ? 'student' : 'students'}
            </>
          )
        }
      />
    );
  }

  const c = props.cls;
  return (
    <CardShell
      href={`/student/classes/${c.id}`}
      name={c.name}
      section={c.section}
      color={c.color}
      coverUrl={c.cover_photo_url}
      archived={c.is_archived}
      showActive={false}
      badges={
        <ClassMetaBadges
          gradeLevel={c.grade_level}
          track={c.track}
          semester={c.semester}
          variant="on-light"
          size="sm"
          hideSection
        />
      }
      footer={c.teacher_name ? `Teacher: ${c.teacher_name}` : null}
    />
  );
}

function CardShell({
  href,
  name,
  section,
  color,
  coverUrl,
  archived,
  showActive,
  badges,
  footer,
}: {
  href: string;
  name: string;
  section: string | null;
  color: string | null;
  coverUrl: string | null;
  archived: boolean;
  showActive: boolean;
  badges: React.ReactNode;
  footer: React.ReactNode;
}) {
  const accent = color ?? DEFAULT_CLASS_COLOR;
  return (
    <Link
      href={href}
      className={`group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-md ${
        archived ? 'opacity-70' : ''
      }`}
    >
      <ClassCover url={coverUrl} color={accent} className="h-24 w-full rounded-xl">
        {!coverUrl && (
          <svg
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 300 96"
            preserveAspectRatio="xMaxYMid slice"
          >
            <circle cx="270" cy="8" r="56" fill="#ffffff" fillOpacity="0.25" />
            <circle cx="30" cy="96" r="38" fill="#ffffff" fillOpacity="0.2" />
          </svg>
        )}
        {(archived || showActive) && (
          <span
            className={`absolute right-2.5 top-2.5 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold ${
              archived ? 'text-zinc-600' : 'text-emerald-700'
            }`}
          >
            {archived ? 'Archived' : 'Active'}
          </span>
        )}
      </ClassCover>

      <div className="flex flex-1 flex-col gap-2.5 px-2 pb-2 pt-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-zinc-900 group-hover:text-red-700">{name}</h3>
          {section && <p className="truncate text-[13px] text-zinc-500">{section}</p>}
        </div>
        {badges}
        {footer && (
          <p className="mt-auto truncate border-t border-zinc-100 pt-2.5 text-[12.5px] text-zinc-500">
            {footer}
          </p>
        )}
      </div>
    </Link>
  );
}