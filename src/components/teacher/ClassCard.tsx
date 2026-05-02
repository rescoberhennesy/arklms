// src/components/teacher/ClassCard.tsx
'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Copy, Pencil, Archive, ArchiveRestore, Trash2, Users } from 'lucide-react';
import type { TeacherClassListItem } from '@/types/class';
import { cn } from '@/lib/utils/cn';

interface ClassCardProps {
  cls: TeacherClassListItem;
  onCopyCode: (code: string) => void;
  onEdit: (cls: TeacherClassListItem) => void;
  onToggleArchive: (cls: TeacherClassListItem) => void;
  onDelete: (cls: TeacherClassListItem) => void;
}

const DEFAULT_COLOR = '#FCA5A5';

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

  const color = cls.color ?? DEFAULT_COLOR;
  const hasCover = !!cls.cover_photo_url;

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md',
        cls.is_archived && 'opacity-70',
      )}
    >
      <Link
        href={`/teacher/classes/${cls.id}`}
        className="relative block h-28 w-full"
        style={hasCover ? undefined : { backgroundColor: color }}
      >
        {hasCover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cls.cover_photo_url ?? ''}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/0 to-black/15" />
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
      </Link>

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
        className="flex flex-1 flex-col gap-2 p-4"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {cls.semester}
        </p>
        <div className="mt-auto flex items-center gap-1.5 text-sm text-gray-600">
          <Users className="h-4 w-4" />
          <span>
            {cls.enrolled_count} {cls.enrolled_count === 1 ? 'student' : 'students'}
          </span>
        </div>
      </Link>
    </div>
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