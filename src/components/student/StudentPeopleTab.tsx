import Image from 'next/image';
import type { ClassPeople } from '@/lib/actions/classPeople';
import type { ClassAvatarInfo } from '@/types/class';
import { cn } from '@/lib/utils/cn';
import { getInitials } from '@/lib/utils/getInitials';

interface Props {
  people: ClassPeople;
}

export default function StudentPeopleTab({ people }: Props) {
  const { teacher, classmates } = people;
  const sortedClassmates = [...classmates].sort((a, b) => {
    const aName = a.full_name || a.email || '';
    const bName = b.full_name || b.email || '';
    return aName.localeCompare(bName);
  });

  return (
    <div className="space-y-6">
      {/* Teacher */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Teacher
        </h2>
        {teacher ? (
          <PersonRow person={teacher} role="teacher" />
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
          <span className="ml-1 font-normal normal-case text-gray-400">
            ({sortedClassmates.length})
          </span>
        </h2>

        {sortedClassmates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
            You&apos;re the only student in this class so far.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {sortedClassmates.map((c) => (
              <li key={c.id}>
                <PersonRow person={c} role="student" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PersonRow({
  person,
  role,
}: {
  person: ClassAvatarInfo;
  role: 'teacher' | 'student';
}) {
  const displayName = person.full_name || person.email || 'Unnamed';
  const initials = getInitials(displayName);
  const isTeacher = role === 'teacher';

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3',
        isTeacher && 'rounded-xl border border-gray-200 bg-white',
      )}
    >
      <PersonAvatar person={person} size={isTeacher ? 48 : 40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {displayName}
        </p>
        {person.email && (
          <p className="truncate text-xs text-gray-500">{person.email}</p>
        )}
      </div>
      {isTeacher && (
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
          Teacher
        </span>
      )}
    </div>
  );
}

function PersonAvatar({
  person,
  size,
}: {
  person: ClassAvatarInfo;
  size: number;
}) {
  const displayName = person.full_name || person.email || 'Unnamed';
  const initials = getInitials(displayName);

  if (person.avatar_url) {
    return (
      <span
        className="relative inline-block flex-shrink-0 overflow-hidden rounded-full bg-gray-200"
        style={{ width: size, height: size }}
        title={displayName}
      >
        <Image
          src={person.avatar_url}
          alt={displayName}
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      </span>
    );
  }

  const palette = [
    'bg-rose-200 text-rose-800',
    'bg-amber-200 text-amber-800',
    'bg-emerald-200 text-emerald-800',
    'bg-sky-200 text-sky-800',
    'bg-violet-200 text-violet-800',
    'bg-pink-200 text-pink-800',
  ];
  const idx = hashStr(person.id) % palette.length;

  return (
    <span
      className={cn(
        'inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold',
        palette[idx],
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
      }}
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