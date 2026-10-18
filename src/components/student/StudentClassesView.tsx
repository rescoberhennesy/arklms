'use client';

import { useState, useTransition, useMemo, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MoreVertical, LogOut, Search, Plus, BookOpen, SearchX, User as UserIcon } from 'lucide-react';
import {
  cancelMyJoinRequest,
  dismissRejectedRequest,
  reorderMyEnrollments,
  leaveClass,
} from '@/lib/actions/enrollments';
import { DEFAULT_CLASS_COLOR, type StudentClassListItem, type ClassAvatarInfo } from '@/types/class';
import { cn } from '@/lib/utils/cn';
import { getInitials } from '@/lib/utils/getInitials';
import ClassCover from '@/components/dashboard/ClassCover';
import ClassMetaBadges from '@/components/dashboard/ClassMetaBadges';
import SortableClassGrid from '@/components/dashboard/SortableClassGrid';
import SortableItem from '@/components/dashboard/SortableItem';
import JoinClassModal from './JoinClassModal';

type PendingRequest = {
  id: string;
  class_id: string;
  class_name: string;
  requested_at: string;
};

type RejectedRequest = {
  id: string;
  class_id: string;
  class_name: string;
  decided_at: string;
};

type Props = {
  enrolledClasses: StudentClassListItem[];
  pendingRequests: PendingRequest[];
  rejectedRequests: RejectedRequest[];
};

type FilterKey = 'all' | 'active' | 'past';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'past', label: 'Past' },
];

const AVATAR_LIMIT = 4;
const GRID_CLASS = 'grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3';

export default function StudentClassesView({ enrolledClasses, pendingRequests, rejectedRequests }: Props) {
  const router = useRouter();
  const [joinOpen, setJoinOpen] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [classes, setClasses] = useState(enrolledClasses);
  const [, startTransition] = useTransition();

  const [filter, setFilter] = useState<FilterKey>('active');
  const [query, setQuery] = useState('');
  const [leaveTarget, setLeaveTarget] = useState<StudentClassListItem | null>(null);

  const activeCount = classes.filter((c) => !c.is_archived).length;
  const pastCount = classes.filter((c) => c.is_archived).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return classes.filter((c) => {
      if (filter === 'active' && c.is_archived) return false;
      if (filter === 'past' && !c.is_archived) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.section ?? '').toLowerCase().includes(q) ||
        (c.teacher_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [classes, filter, query]);

  const reorderEnabled = filter === 'active' || (filter === 'all' && pastCount === 0);

  async function handleReorder(orderedIds: string[]) {
    const snapshot = classes;
    setClasses((prev) => {
      const byId = new Map(prev.map((c) => [c.id, c]));
      const reordered = orderedIds
        .map((id) => byId.get(id))
        .filter((c): c is StudentClassListItem => Boolean(c));
      const known = new Set(orderedIds);
      const rest = prev.filter((c) => !known.has(c.id));
      return [...reordered, ...rest];
    });

    try {
      await reorderMyEnrollments(orderedIds);
    } catch (err) {
      setClasses(snapshot);
      setError(err instanceof Error ? err.message : 'Could not save new order');
    }
  }

  function handleCancel(requestId: string) {
    if (!confirm('Cancel this join request?')) return;
    setCancelingId(requestId);
    setError(null);
    startTransition(async () => {
      try {
        await cancelMyJoinRequest(requestId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to cancel request');
      } finally {
        setCancelingId(null);
      }
    });
  }

  function handleDismiss(requestId: string) {
    setDismissingId(requestId);
    setError(null);
    startTransition(async () => {
      try {
        await dismissRejectedRequest(requestId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to dismiss request');
      } finally {
        setDismissingId(null);
      }
    });
  }

  const subtitle =
    `${activeCount} active ${activeCount === 1 ? 'class' : 'classes'}` +
    (pastCount > 0 ? ` · ${pastCount} past` : '');

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight text-zinc-900">My classes</h1>
          <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setJoinOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-[0_6px_16px_rgba(220,38,38,0.22)] transition-all hover:bg-red-700 active:scale-[0.98]"
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.4} />
          Join class
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {/* Join requests */}
      {(pendingRequests.length > 0 || rejectedRequests.length > 0) && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h2 className="border-b border-zinc-100 px-5 py-3.5 text-[15px] font-bold text-zinc-900">Join requests</h2>
          <ul className="divide-y divide-zinc-100">
            {pendingRequests.map((req) => (
              <li key={req.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-zinc-900">{req.class_name}</p>
                  <p className="text-xs text-zinc-500">
                    <span className="font-semibold text-amber-700">Waiting for teacher approval</span> · Sent{' '}
                    {new Date(req.requested_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCancel(req.id)}
                  disabled={cancelingId === req.id}
                  className="rounded-lg border border-zinc-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                >
                  {cancelingId === req.id ? 'Canceling…' : 'Cancel request'}
                </button>
              </li>
            ))}
            {rejectedRequests.map((req) => (
              <li key={req.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-zinc-900">{req.class_name}</p>
                  <p className="text-xs text-zinc-500">
                    <span className="font-semibold text-red-700">Not accepted</span> ·{' '}
                    {new Date(req.decided_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDismiss(req.id)}
                  disabled={dismissingId === req.id}
                  className="rounded-lg border border-zinc-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                >
                  {dismissingId === req.id ? 'Dismissing…' : 'Dismiss'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Toolbar: search (left) + segmented filter (right) */}
      {classes.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by class, section, or teacher"
              aria-label="Search classes"
              className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 transition-shadow focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10"
            />
          </div>

          <div role="tablist" aria-label="Filter classes" className="inline-flex w-fit items-center gap-1 rounded-xl bg-zinc-100 p-1">
            {FILTERS.map((f) => {
              const isActive = filter === f.key;
              const count = f.key === 'all' ? classes.length : f.key === 'active' ? activeCount : pastCount;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-[9px] px-3.5 py-2 text-[13px] transition-all',
                    isActive
                      ? 'bg-white font-bold text-red-700 shadow-[0_1px_3px_rgba(28,25,23,0.08)]'
                      : 'font-semibold text-zinc-600 hover:text-zinc-900',
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[11px] font-semibold',
                      isActive ? 'bg-red-50 text-red-700' : 'text-zinc-400',
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty states */}
      {classes.length === 0 && (
        <EmptyState
          icon={<BookOpen className="h-6 w-6" />}
          title="You haven't joined any classes yet"
          message="Use Join class above and enter the invite code from your teacher."
        />
      )}

      {classes.length > 0 && filtered.length === 0 && (
        <EmptyState
          icon={<SearchX className="h-6 w-6" />}
          title={query ? 'No classes match your search' : `No ${filter} classes`}
          message={query ? 'Try a different keyword or clear the search.' : 'Switch the filter to see other classes.'}
        />
      )}

      {/* Grid */}
      {filtered.length > 0 && (
        <SortableClassGrid
          items={filtered}
          className={GRID_CLASS}
          onReorder={reorderEnabled ? handleReorder : () => {}}
          disabled={!reorderEnabled}
          renderItem={(klass) =>
            reorderEnabled ? (
              <SortableItem id={klass.id}>
                <StudentClassCard klass={klass} onLeave={() => setLeaveTarget(klass)} />
              </SortableItem>
            ) : (
              <StudentClassCard klass={klass} onLeave={() => setLeaveTarget(klass)} />
            )
          }
        />
      )}

      <JoinClassModal open={joinOpen} onClose={() => setJoinOpen(false)} />

      {leaveTarget && (
        <LeaveClassConfirm
          klass={leaveTarget}
          onClose={() => setLeaveTarget(null)}
          onSuccess={() => {
            setClasses((prev) => prev.filter((c) => c.id !== leaveTarget.id));
            setLeaveTarget(null);
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card (matches the teacher ClassCard)
// ---------------------------------------------------------------------------

function StudentClassCard({ klass, onLeave }: { klass: StudentClassListItem; onLeave: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
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

  const avatars = klass.avatars ?? [];
  const visibleAvatars = avatars.slice(0, AVATAR_LIMIT);
  const overflow = Math.max(0, avatars.length - visibleAvatars.length);
  const classmateCount = avatars.length;

  const color = klass.color ?? DEFAULT_CLASS_COLOR;
  const hasPhoto = !!klass.cover_photo_url;
  const monogram = getInitials(klass.name);
  const href = `/student/classes/${klass.id}`;

  return (
    <div
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-[20px] border border-stone-200/80 bg-white',
        'shadow-[0_1px_2px_rgba(28,25,23,0.04),0_8px_24px_rgba(28,25,23,0.05)]',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(28,25,23,0.05),0_14px_32px_rgba(28,25,23,0.09)]',
        klass.is_archived && 'opacity-70',
      )}
    >
      <Link href={href} className="block" tabIndex={-1} aria-hidden="true">
        <ClassCover url={klass.cover_photo_url} color={color} className="h-28 w-full">
          {!hasPhoto && (
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
          )}
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
          <div role="menu" className="absolute right-0 mt-1.5 w-44 overflow-hidden rounded-xl border border-stone-200 bg-white p-1 shadow-xl">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onLeave();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
              Leave class
            </button>
          </div>
        )}
      </div>

      <Link href={href} className="flex flex-1 flex-col gap-3.5 px-5 pb-5 pt-10">
        <div className="min-w-0">
          <h3 className="truncate text-[17px] font-bold tracking-tight text-stone-900">{klass.name}</h3>
          {klass.section && <p className="mt-0.5 truncate text-sm text-stone-500">{klass.section}</p>}
        </div>

        <ClassMetaBadges
          gradeLevel={klass.grade_level}
          track={klass.track}
          semester={klass.semester}
          variant="on-light"
          size="sm"
          hideSection
        />

        {klass.teacher_name && (
          <p className="flex items-center gap-1.5 truncate text-[13px] text-stone-600">
            <UserIcon className="h-3.5 w-3.5 shrink-0 text-stone-400" />
            <span className="truncate">{klass.teacher_name}</span>
          </p>
        )}

        {/* Footer: classmates (left) + status (right) */}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-stone-100 pt-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {!klass.is_archived && visibleAvatars.length > 0 && (
              <AvatarStack avatars={visibleAvatars} overflow={overflow} />
            )}
            <span className="truncate text-[13px] text-stone-600">
              {klass.is_archived ? (
                'Class ended'
              ) : classmateCount === 0 ? (
                'No classmates yet'
              ) : (
                <>
                  <b className="font-semibold text-stone-900">{classmateCount}</b>{' '}
                  {classmateCount === 1 ? 'classmate' : 'classmates'}
                </>
              )}
            </span>
          </div>
          <StatusPill archived={klass.is_archived} />
        </div>
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function EmptyState({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">{icon}</span>
      <h3 className="text-base font-bold text-stone-900">{title}</h3>
      <p className="mt-1 text-sm text-stone-500">{message}</p>
    </div>
  );
}

function AvatarStack({ avatars, overflow }: { avatars: ClassAvatarInfo[]; overflow: number }) {
  return (
    <div className="flex shrink-0 items-center -space-x-1.5">
      {avatars.map((a) => (
        <Avatar key={a.id} info={a} />
      ))}
      {overflow > 0 && (
        <span
          className="z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-stone-100 text-[11px] font-semibold text-stone-600"
          title={`${overflow} more classmate${overflow === 1 ? '' : 's'}`}
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
        <Image src={info.avatar_url} alt={displayName} fill sizes="28px" className="object-cover" />
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
        Past
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

function LeaveClassConfirm({
  klass,
  onClose,
  onSuccess,
  onError,
}: {
  klass: StudentClassListItem;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        await leaveClass(klass.id);
        onSuccess();
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Could not leave class');
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={() => !pending && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-zinc-900">Leave this class?</h2>
        <p className="mt-2 text-sm text-zinc-600">
          You&apos;ll lose access to <strong className="text-zinc-900">{klass.name}</strong>&apos;s materials and grades.
          You can request to join again later if you change your mind.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? 'Leaving…' : 'Leave class'}
          </button>
        </div>
      </div>
    </div>
  );
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}