'use client';

import { useState } from 'react';
import type { ClassPeople } from '@/lib/actions/classPeople';
import type { ClassAvatarInfo } from '@/types/class';
import { cn } from '@/lib/utils/cn';
import { PersonAvatar, ProfileCard } from '@/components/dashboard/ProfileCard';

interface Props {
  people: ClassPeople;
}

type Selected = { person: ClassAvatarInfo; role: 'teacher' | 'student' } | null;

const nameOf = (p: ClassAvatarInfo) => p.full_name || p.email || 'Unnamed';
const usernameOf = (p: ClassAvatarInfo) => (p as { username?: string | null }).username ?? null;

export default function StudentPeopleTab({ people }: Props) {
  const { teacher, classmates } = people;
  const [selected, setSelected] = useState<Selected>(null);
  const sortedClassmates = [...classmates].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Teacher</h2>
        {teacher ? (
          <PersonRow person={teacher} isTeacher onOpen={() => setSelected({ person: teacher, role: 'teacher' })} />
        ) : (
          <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            Teacher info unavailable.
          </p>
        )}
      </section>

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
                <PersonRow person={c} onOpen={() => setSelected({ person: c, role: 'student' })} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <ProfileCard
          id={selected.person.id}
          name={nameOf(selected.person)}
          username={usernameOf(selected.person)}
          avatarUrl={selected.person.avatar_url}
          roleLabel={selected.role === 'teacher' ? 'Teacher' : 'Student'}
          highlightRole={selected.role === 'teacher'}
          viewerRole="student"
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function PersonRow({ person, isTeacher = false, onOpen }: { person: ClassAvatarInfo; isTeacher?: boolean; onOpen: () => void }) {
  const name = nameOf(person);
  const username = usernameOf(person);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${name}'s profile`}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-50 focus:outline-none focus-visible:bg-zinc-50',
        isTeacher && 'rounded-xl border border-gray-200 bg-white',
      )}
    >
      <PersonAvatar id={person.id} name={name} url={person.avatar_url} size={isTeacher ? 48 : 40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{name}</p>
        {username && <p className="truncate text-xs text-gray-500">@{username}</p>}
      </div>
      {isTeacher && (
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
          Teacher
        </span>
      )}
    </button>
  );
}