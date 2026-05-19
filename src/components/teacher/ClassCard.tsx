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
  Users,
} from 'lucide-react';
import type { TeacherClassListItem, ClassAvatarInfo } from '@/types/class';
import { cn } from '@/lib/utils/cn';
import { getInitials } from '@/lib/utils/getInitials';
import ClassCover from '@/components/dashboard/ClassCover';

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

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md',
        cls.is_archived && 'opacity-70',
      )}
    >
      <Link href={`/teacher/classes/${cls.id}`} className="block">
        <ClassCover
          url={cls.cover_photo_url}
          color={cls.color}
          className="h-28 w-full"
        >
          <div className="absolute inset-x-0 bottom-0 p-4">
            <h3 className="truncate text-lg font-semibold text-white drop-shadow-sm">
              {cls.name}
            </h3>
            {cls.section && (
              <p className="truncate text-sm text-white/90 drop-shadow-sm">
                {cls.section}
              </p>
            )}
          </div>
        </ClassCover>
      </Link>

      {/* Kebab menu */}
      <div ref={menuRef} className="absolute right-2 top-2">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="rounded-full bg-white/85 p-1.5 text-gray-700 shadow-sm hover:bg-white"
          aria-label="Class actions"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-1 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
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
            <div className="border-t border-gray-100" />
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

      <Link
        href={`/teacher/classes/${cls.id}`}
        className="flex flex-1 flex-col gap-3 p-4"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {cls.semester}
        </p>

        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <Users className="h-4 w-4" />
          <span>
            {cls.enrolled_count} {cls.enrolled_count === 1 ? 'student' : 'students'}
          </span>
        </div>

        {/* Bottom row: avatars (left) + status pill (right) */}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          {!cls.is_archived && visibleAvatars.length > 0 ? (
            <AvatarStack avatars={visibleAvatars} overflow={overflow} />
          ) : (
            <span /> /* spacer so pill stays right-aligned */
          )}
          <StatusPill archived={cls.is_archived} />
        </div>
      </Link>
    </div>
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
    <div className="flex items-center -space-x-1.5">
      {avatars.map((a) => (
        <Avatar key={a.id} info={a} />
      ))}
      {overflow > 0 && (
        <span
          className="z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-[11px] font-semibold text-gray-600"
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
        className="relative inline-block h-7 w-7 overflow-hidden rounded-full border-2 border-white bg-gray-200"
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

  // Deterministic pastel from id (so the same student gets a consistent color)
  const palette = ['bg-rose-200 text-rose-800', 'bg-amber-200 text-amber-800', 'bg-emerald-200 text-emerald-800', 'bg-sky-200 text-sky-800', 'bg-violet-200 text-violet-800', 'bg-pink-200 text-pink-800'];
  const idx = hashStr(info.id) % palette.length;

  return (
    <span
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold',
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
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
        Archived
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
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
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50',
        destructive ? 'text-red-600 hover:bg-red-50' : 'text-gray-700',
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