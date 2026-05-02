'use client';

import Link from 'next/link';
import { useState, useTransition, useRef, useEffect } from 'react';
import { MoreVertical, Copy, RefreshCw, Archive, ArchiveRestore, Check } from 'lucide-react';
import {
  setClassArchived,
  regenerateInviteCode,
} from '@/lib/actions/classes';
import type { ClassRow } from '@/types/class';

interface ClassCardProps {
  classRow: ClassRow;
}

export default function ClassCard({ classRow }: ClassCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  const stop = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  async function handleCopyCode(e: React.MouseEvent) {
    stop(e);
    try {
      await navigator.clipboard.writeText(classRow.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
    setMenuOpen(false);
  }

  function handleRegenerateCode(e: React.MouseEvent) {
    stop(e);
    setMenuOpen(false);
    if (!confirm('Reset the invite code? Old code will stop working immediately.')) {
      return;
    }
    startTransition(async () => {
      const res = await regenerateInviteCode(classRow.id);
      if (!res.ok) setError(res.error);
    });
  }

  function handleToggleArchive(e: React.MouseEvent) {
    stop(e);
    setMenuOpen(false);
    startTransition(async () => {
      const res = await setClassArchived(classRow.id, !classRow.is_archived);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <Link
      href={`/teacher/classes/${classRow.id}`}
      className="group relative block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-500"
    >
      <div
        className="relative h-24 px-4 py-3"
        style={{ backgroundColor: classRow.color }}
      >
        <h3 className="line-clamp-2 pr-10 text-lg font-semibold text-white">
          {classRow.name}
        </h3>
        {classRow.section && (
          <p className="mt-1 text-sm font-medium text-white/90">
            {classRow.section}
          </p>
        )}

        <div ref={menuRef} className="absolute right-2 top-2">
          <button
            type="button"
            aria-label="Class options"
            onClick={(e) => {
              stop(e);
              setMenuOpen((v) => !v);
            }}
            className="rounded-full p-1.5 text-white/90 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/60"
          >
            <MoreVertical size={18} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-9 z-10 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
              onClick={stop}
            >
              <MenuItem
                icon={copied ? <Check size={16} /> : <Copy size={16} />}
                label={copied ? 'Copied!' : `Copy code: ${classRow.invite_code}`}
                onClick={handleCopyCode}
              />
              <MenuItem
                icon={<RefreshCw size={16} />}
                label="Reset invite code"
                onClick={handleRegenerateCode}
                disabled={isPending}
              />
              <div className="my-1 border-t border-gray-100" />
              <MenuItem
                icon={
                  classRow.is_archived ? (
                    <ArchiveRestore size={16} />
                  ) : (
                    <Archive size={16} />
                  )
                }
                label={classRow.is_archived ? 'Restore class' : 'Archive class'}
                onClick={handleToggleArchive}
                disabled={isPending}
              />
            </div>
          )}
        </div>
      </div>

      <div className="p-4">
        {classRow.subject_code && (
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {classRow.subject_code}
          </p>
        )}
        <p className="mt-1 text-sm text-gray-700">{classRow.semester}</p>
        {classRow.description && (
          <p className="mt-2 line-clamp-2 text-sm text-gray-600">
            {classRow.description}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
          <span className="text-xs text-gray-500">Invite code</span>
          <code className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-800">
            {classRow.invite_code}
          </code>
        </div>
      </div>

      {error && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </Link>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="text-gray-500">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}