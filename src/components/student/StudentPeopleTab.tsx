'use client';

import { useEffect, useState } from 'react';
import { Mail, Copy, Check, X } from 'lucide-react';
import type { ClassPeople } from '@/lib/actions/classPeople';
import type { ClassAvatarInfo } from '@/types/class';
import { cn } from '@/lib/utils/cn';
import { getInitials } from '@/lib/utils/getInitials';

interface Props {
  people: ClassPeople;
}

type Selected = { person: ClassAvatarInfo; role: 'teacher' | 'student' } | null;

export default function StudentPeopleTab({ people }: Props) {
  const { teacher, classmates } = people;
  const [selected, setSelected] = useState<Selected>(null);

  const sortedClassmates = [...classmates].sort((a, b) => {
    const aName = a.full_name || a.email || '';
    const bName = b.full_name || b.email || '';
    return aName.localeCompare(bName);
  });

  return (
    <div className="space-y-6">
      {/* Teacher */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Teacher</h2>
        {teacher ? (
          <PersonRow person={teacher} role="teacher" onOpen={() => setSelected({ person: teacher, role: 'teacher' })} />
        ) : (
          <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            Teacher info unavailable.
          </p>
        )}
      </section>

      {/* Classmates */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Classmates{' '}
          <span className="ml-1 font-normal normal-case text-gray-400">({sortedClassmates.length})</span>
        </h2>

        {sortedClassmates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
            You&apos;re the only student in this class so far.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {sortedClassmates.map((c) => (
              <li key={c.id}>
                <PersonRow person={c} role="student" onOpen={() => setSelected({ person: c, role: 'student' })} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <ProfileCard person={selected.person} role={selected.role} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function PersonRow({
  person,
  role,
  onOpen,
}: {
  person: ClassAvatarInfo;
  role: 'teacher' | 'student';
  onOpen: () => void;
}) {
  const displayName = person.full_name || person.email || 'Unnamed';
  const isTeacher = role === 'teacher';

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${displayName}'s profile`}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-50 focus:outline-none focus-visible:bg-zinc-50',
        isTeacher && 'rounded-xl border border-gray-200 bg-white',
      )}
    >
      <PersonAvatar person={person} size={isTeacher ? 48 : 40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
        {person.email && <p className="truncate text-xs text-gray-500">{person.email}</p>}
      </div>
      {isTeacher && (
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
          Teacher
        </span>
      )}
    </button>
  );
}

function ProfileCard({
  person,
  role,
  onClose,
}: {
  person: ClassAvatarInfo;
  role: 'teacher' | 'student';
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const displayName = person.full_name || person.email || 'Unnamed';
  const isTeacher = role === 'teacher';

  // Close on Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copyEmail() {
    if (!person.email) return;
    try {
      await navigator.clipboard.writeText(person.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-card-name"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-t-3xl bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] sm:rounded-3xl"
      >
        {/* Charcoal header */}
        <div className="relative h-24 bg-zinc-900">
          <svg aria-hidden="true" className="absolute -right-10 -top-16 h-44 w-44" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="49" fill="none" stroke="#ffffff" strokeOpacity="0.08" />
          </svg>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Avatar overlapping the header */}
        <div className="-mt-12 flex flex-col items-center px-6 pb-6 text-center">
          <div className="rounded-full ring-4 ring-white">
            <PersonAvatar person={person} size={96} />
          </div>

          <h2 id="profile-card-name" className="mt-3 text-lg font-extrabold text-zinc-900">
            {displayName}
          </h2>
          <span
            className={cn(
              'mt-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide',
              isTeacher ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-700',
            )}
          >
            {isTeacher ? 'Teacher' : 'Student'}
          </span>

          {person.email && (
            <>
              <p className="mt-4 w-full truncate rounded-xl bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700">
                {person.email}
              </p>
              <div className="mt-3 grid w-full grid-cols-2 gap-2">
                <a
                  href={`mailto:${person.email}`}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-900 text-sm font-bold text-white transition hover:bg-zinc-800"
                >
                  <Mail className="h-4 w-4" />
                  Send email
                </a>
                <button
                  type="button"
                  onClick={copyEmail}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy email'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PersonAvatar({ person, size }: { person: ClassAvatarInfo; size: number }) {
  const [failed, setFailed] = useState(false);
  const displayName = person.full_name || person.email || 'Unnamed';
  const initials = getInitials(displayName);

  if (person.avatar_url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={person.avatar_url}
        alt={displayName}
        title={displayName}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className="block flex-shrink-0 rounded-full bg-gray-200 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  // Initials fallback, in theme-friendly neutrals with one red tone
  const palette = [
    'bg-zinc-900 text-white',
    'bg-zinc-200 text-zinc-800',
    'bg-red-100 text-red-800',
    'bg-stone-200 text-stone-800',
    'bg-zinc-700 text-white',
  ];
  const idx = hashStr(person.id) % palette.length;

  return (
    <span
      className={cn('inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold', palette[idx])}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      title={displayName}
    >
      {initials}
    </span>
  );
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}