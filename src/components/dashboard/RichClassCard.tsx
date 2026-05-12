// src/components/dashboard/RichClassCard.tsx
//
// Card used in the "Your Classes" left column of both dashboards.
// Visual: cover image with class name overlay, body with semester +
// member-count, active/draft (archived) badge in the corner.
//
// Two variants for teachers vs students because the underlying types
// differ (TeacherClassListItem has enrolled_count + is_archived;
// StudentClassListItem has teacher_name).
//
// No progress bar this session — defining "class progress" is a design
// conversation deferred to Phase 9+.

import Link from 'next/link';
import { Users } from 'lucide-react';
import ClassCover from '@/components/dashboard/ClassCover';
import type {
  TeacherClassListItem,
  StudentClassListItem,
} from '@/types/class';

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
  if (props.role === 'teacher') return <TeacherCard cls={props.cls} />;
  return <StudentCard cls={props.cls} />;
}

function TeacherCard({ cls }: { cls: TeacherClassListItem }) {
  const isActive = !cls.is_archived;
  return (
    <Link
      href={`/teacher/classes/${cls.id}`}
      className="group relative block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-red-300 hover:shadow-md"
    >
      <ClassCover
        url={cls.cover_photo_url}
        color={cls.color}
        className="h-28 w-full"
      >
        <div className="absolute right-3 top-3">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              isActive
                ? 'bg-emerald-500/90 text-white'
                : 'bg-slate-500/90 text-white'
            }`}
          >
            {isActive ? 'Active' : 'Archived'}
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3 className="truncate text-base font-semibold text-white drop-shadow">
            {cls.name}
          </h3>
          {cls.section && (
            <p className="truncate text-xs text-white/90 drop-shadow">
              {cls.section}
            </p>
          )}
        </div>
      </ClassCover>
      <div className="flex items-center justify-between px-3 py-2.5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {cls.semester}
        </p>
        <div className="flex items-center gap-1 text-xs font-medium text-slate-600">
          <Users className="h-3.5 w-3.5" />
          <span>
            {cls.enrolled_count}{' '}
            {cls.enrolled_count === 1 ? 'student' : 'students'}
          </span>
        </div>
      </div>
    </Link>
  );
}

function StudentCard({ cls }: { cls: StudentClassListItem }) {
  const isActive = !cls.is_archived;
  return (
    <Link
      href={`/student/classes/${cls.id}`}
      className="group relative block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-red-300 hover:shadow-md"
    >
      <ClassCover
        url={cls.cover_photo_url}
        color={cls.color}
        className="h-28 w-full"
      >
        {!isActive && (
          <div className="absolute right-3 top-3">
            <span className="rounded-full bg-slate-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Archived
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3 className="truncate text-base font-semibold text-white drop-shadow">
            {cls.name}
          </h3>
          {cls.section && (
            <p className="truncate text-xs text-white/90 drop-shadow">
              {cls.section}
            </p>
          )}
        </div>
      </ClassCover>
      <div className="flex items-center justify-between px-3 py-2.5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {cls.semester}
        </p>
        {cls.teacher_name && (
          <p className="truncate text-xs text-slate-600">
            {cls.teacher_name}
          </p>
        )}
      </div>
    </Link>
  );
}