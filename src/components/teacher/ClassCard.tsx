'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
  MoreVertical,
  Copy,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  User,
} from 'lucide-react';
import type { TeacherClassListItem, ClassAvatarInfo } from '@/types/class';
import { DEFAULT_CLASS_COLOR } from '@/types/class';
import { cn } from '@/lib/utils/cn';
import { getInitials } from '@/lib/utils/getInitials';
import ClassCover from '@/components/dashboard/ClassCover';
import ClassMetaBadges from '@/components/dashboard/ClassMetaBadges';

interface ClassCardProps {
  cls: TeacherClassListItem;
  onCopyCode: (code: string) => void;
  onEdit: (cls: TeacherClassListItem) => void;
  onToggleArchive: (cls: TeacherClassListItem) => void;
  onDelete: (cls: TeacherClassListItem) => void;
}

const AVATAR_LIMIT = 4;

export function ClassCard({
  cls,
  onCopyCode,
  onEdit,
  onToggleArchive,
  onDelete,
}: ClassCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const avatars = cls.avatars ?? [];
  const visibleAvatars = avatars.slice(0, AVATAR_LIMIT);
  const overflow = Math.max(0, cls.enrolled_count - visibleAvatars.length);

  const color = cls.color ?? DEFAULT_CLASS_COLOR;
  const hasPhoto = !!cls.cover_photo_url;
  const monogram = getInitials(cls.name);
  const href = `/teacher/classes/${cls.id}`;

  return (
    <div
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-[20px] border border-stone-200/80 bg-white',
        'shadow-[0_1px_2px_rgba(28,25,23,0.04),0_8px_24px_rgba(28,25,23,0.05)]',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(28,25,23,0.05),0_14px_32px_rgba(28,25,23,0.09)]',
        cls.is_archived && 'opacity-70',
      )}
    >
      {/* Cover (same link as the body; skipped by keyboard to avoid a duplicate tab stop) */}
      <Link href={href} className="block" tabIndex={-1} aria-hidden="true">
        <ClassCover url={cls.cover_photo_url} color={color} className="h-28 w-full">
          {!hasPhoto && <CoverDecor />}
        </ClassCover>
      </Link>

      {/* Monogram tile overlapping the cover edge */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-5 top-[84px] z-[1] flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-white bg-white text-lg font-extrabold shadow-[0_4px_12px_rgba(28,25,23,0.10)]"
        style={{ color: `color-mix(in oklab, ${color} 55%, #1c1917)` }}
      >
        {monogram}
      </span>

      {/* Kebab menu */}
      <div ref={menuRef} className="absolute right-3 top-3 z-[2]">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 text-stone-700 shadow-sm backdrop-blur-sm transition-colors hover:bg-white"
          aria-label="Class actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-1.5 w-48 overflow-hidden rounded-xl border border-stone-200 bg-white p-1 shadow-xl"
          >
            <MenuItem
              icon={<Copy className="h-4 w-4" />}
              label="Copy code"
              onClick={() => {
                setMenuOpen(false);
                onCopyCode(cls.invite_code);
              }}
            />
            <MenuItem
              icon={<Pencil className="h-4 w-4" />}
              label="Edit"
              onClick={() => {
                setMenuOpen(false);
                onEdit(cls);
              }}
            />
            <MenuItem
              icon={
                cls.is_archived ? (
                  <ArchiveRestore className="h-4 w-4" />
                ) : (
                  <Archive className="h-4 w-4" />
                )
              }
              label={cls.is_archived ? 'Unarchive' : 'Archive'}
              onClick={() => {
                setMenuOpen(false);
                onToggleArchive(cls);
              }}
            />
            <div className="my-1 border-t border-stone-100" />
            <MenuItem
              icon={<Trash2 className="h-4 w-4" />}
              label="Delete"
              destructive
              onClick={() => {
                setMenuOpen(false);
                onDelete(cls);
              }}
            />
          </div>
        )}
      </div>

      <Link href={href} className="flex flex-1 flex-col gap-3.5 px-5 pb-5 pt-10">
        <div className="min-w-0">
          <h3 className="truncate text-[17px] font-bold tracking-tight text-stone-900">
            {cls.name}
          </h3>
          {cls.section && (
            <p className="mt-0.5 truncate text-sm text-stone-500">{cls.section}</p>
          )}
        </div>

        {/* Section is shown as the subtitle above, so hide it here. */}
        <ClassMetaBadges
          gradeLevel={cls.grade_level}
          track={cls.track}
          semester={cls.semester}
          variant="on-light"
          size="sm"
          hideSection
        />

        {/* Footer: students (left) + status (right) */}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-stone-100 pt-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {!cls.is_archived && visibleAvatars.length > 0 ? (
              <AvatarStack avatars={visibleAvatars} overflow={overflow} />
            ) : cls.enrolled_count === 0 ? (
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-stone-200 bg-stone-50 text-stone-400">
                <User className="h-3.5 w-3.5" />
              </span>
            ) : null}
            <span className="truncate text-[13px] text-stone-600">
              {cls.enrolled_count === 0 ? (
                'No students yet'
              ) : (
                <>
                  <b className="font-semibold text-stone-900">{cls.enrolled_count}</b>{' '}
                  {cls.enrolled_count === 1 ? 'student' : 'students'}
                </>
              )}
            </span>
          </div>
          <StatusPill archived={cls.is_archived} />
        </div>
      </Link>
    </div>
  );
}

/** Soft decorative circles on plain-color covers (hidden when a photo is set). */
function CoverDecor() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 400 112"
      preserveAspectRatio="xMaxYMid slice"
    >
      <circle cx="350" cy="10" r="70" fill="#ffffff" fillOpacity="0.22" />
      <circle cx="290" cy="110" r="44" fill="#ffffff" fillOpacity="0.16" />
      <circle cx="395" cy="96" r="22" fill="#ffffff" fillOpacity="0.2" />
    </svg>
  );
}

function AvatarStack({
  avatars,
  overflow,
}: {
  avatars: ClassAvatarInfo[];
  overflow: number;
}) {
  return (
    <div className="flex shrink-0 items-center -space-x-1.5">
      {avatars.map((a) => (
        <Avatar key={a.id} info={a} />
      ))}
      {overflow > 0 && (
        <span
          className="z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-stone-100 text-[11px] font-semibold text-stone-600"
          title={`${overflow} more student${overflow === 1 ? '' : 's'}`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

function Avatar({ info }: { info: ClassAvatarInfo }) {
  const displayName = info.full_name || info.email || 'Student';
  const initials = getInitials(displayName);

  if (info.avatar_url) {
    return (
      <span
        className="relative inline-block h-7 w-7 overflow-hidden rounded-full border-2 border-white bg-stone-200"
        title={displayName}
      >
        <Image
          src={info.avatar_url}
          alt={displayName}
          fill
          sizes="28px"
          className="object-cover"
        />
      </span>
    );
  }

  const palette = [
    'bg-rose-100 text-rose-800',
    'bg-amber-100 text-amber-800',
    'bg-emerald-100 text-emerald-800',
    'bg-sky-100 text-sky-800',
    'bg-violet-100 text-violet-800',
    'bg-pink-100 text-pink-800',
  ];
  const idx = hashStr(info.id) % palette.length;

  return (
    <span
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold',
        palette[idx],
      )}
      title={displayName}
    >
      {initials}
    </span>
  );
}

function StatusPill({ archived }: { archived: boolean }) {
  if (archived) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
        <span className="h-1.5 w-1.5 rounded-full bg-stone-400" />
        Archived
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Active
    </span>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
        destructive
          ? 'text-red-600 hover:bg-red-50'
          : 'text-stone-700 hover:bg-stone-50',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}