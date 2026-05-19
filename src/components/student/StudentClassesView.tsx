'use client';

import { useState, useTransition, useMemo, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MoreVertical,
  LogOut,
  Users,
  Search,
} from 'lucide-react';
import {
  cancelMyJoinRequest,
  dismissRejectedRequest,
  reorderMyEnrollments,
  leaveClass,
} from '@/lib/actions/enrollments';
import type { StudentClassListItem, ClassAvatarInfo } from '@/types/class';
import { cn } from '@/lib/utils/cn';
import { getInitials } from '@/lib/utils/getInitials';
import ClassCover from '@/components/dashboard/ClassCover';
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

export default function StudentClassesView({
  enrolledClasses,
  pendingRequests,
  rejectedRequests,
}: Props) {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">My classes</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {activeCount} active{pastCount > 0 && `, ${pastCount} past`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setJoinOpen(true)}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          + Join class
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Pending requests
          </h2>
          <ul className="space-y-2">
            {pendingRequests.map((req) => (
              <li
                key={req.id}
                className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-gray-900">{req.class_name}</p>
                  <p className="text-xs text-amber-700">
                    Waiting for teacher approval ·{' '}
                    {new Date(req.requested_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCancel(req.id)}
                  disabled={cancelingId === req.id}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  {cancelingId === req.id ? 'Canceling...' : 'Cancel'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Rejected requests */}
      {rejectedRequests.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Rejected requests
          </h2>
          <ul className="space-y-2">
            {rejectedRequests.map((req) => (
              <li
                key={req.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-gray-900">{req.class_name}</p>
                  <p className="text-xs text-gray-600">
                    Rejected on {new Date(req.decided_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDismiss(req.id)}
                  disabled={dismissingId === req.id}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {dismissingId === req.id ? 'Dismissing...' : 'Dismiss'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Toolbar: search + filter pills (grouped on the left) */}
      {classes.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search classes…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => {
              const isActive = filter === f.key;
              const count =
                f.key === 'all'
                  ? classes.length
                  : f.key === 'active'
                  ? activeCount
                  : pastCount;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border bg-white px-3.5 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-red-500 text-red-600 ring-1 ring-red-500'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50',
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      'text-xs',
                      isActive ? 'text-red-500/80' : 'text-gray-400',
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
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
          <p className="text-gray-600">You have not joined any classes yet.</p>
          <button
            type="button"
            onClick={() => setJoinOpen(true)}
            className="mt-3 text-sm font-medium text-red-600 hover:text-red-700"
          >
            Join your first class
          </button>
        </div>
      )}

      {classes.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <h3 className="text-base font-medium text-gray-900">
            {query ? 'No classes match your search' : `No ${filter} classes`}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {query
              ? 'Try a different keyword or clear the search.'
              : 'Switch filter to see other classes.'}
          </p>
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 && (
        <SortableClassGrid
          items={filtered}
          onReorder={reorderEnabled ? handleReorder : () => {}}
          disabled={!reorderEnabled}
          renderItem={(klass) =>
            reorderEnabled ? (
              <SortableItem id={klass.id}>
                <StudentClassCard
                  klass={klass}
                  onLeave={() => setLeaveTarget(klass)}
                />
              </SortableItem>
            ) : (
              <StudentClassCard
                klass={klass}
                onLeave={() => setLeaveTarget(klass)}
              />
            )
          }
        />
      )}

      <JoinClassModal open={joinOpen} onClose={() => setJoinOpen(false)} />

      {/* Leave class confirmation */}
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
// Card
// ---------------------------------------------------------------------------

function StudentClassCard({
  klass,
  onLeave,
}: {
  klass: StudentClassListItem;
  onLeave: () => void;
}) {
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

  const avatars = klass.avatars ?? [];
  const visibleAvatars = avatars.slice(0, AVATAR_LIMIT);
  const overflow = Math.max(0, avatars.length - visibleAvatars.length);
  const classmateCount = avatars.length;

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md',
        klass.is_archived && 'opacity-70',
      )}
    >
      <Link href={`/student/classes/${klass.id}`} className="block">
        <ClassCover
          url={klass.cover_photo_url}
          color={klass.color}
          className="h-28 w-full"
        >
          <div className="absolute inset-x-0 bottom-0 p-4">
            <h3 className="truncate text-lg font-semibold text-white drop-shadow-sm">
              {klass.name}
            </h3>
            {klass.section && (
              <p className="truncate text-sm text-white/90 drop-shadow-sm">
                {klass.section}
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
          <div className="absolute right-0 mt-1 w-40 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onLeave();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
              <span>Leave class</span>
            </button>
          </div>
        )}
      </div>

      <Link
        href={`/student/classes/${klass.id}`}
        className="flex flex-1 flex-col gap-2 p-4"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {klass.semester}
        </p>

        <p className="truncate text-sm font-medium text-gray-700">
          {klass.teacher_name ?? 'Teacher'}
        </p>

        {!klass.is_archived && classmateCount > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <Users className="h-4 w-4" />
            <span>
              {classmateCount} classmate{classmateCount === 1 ? '' : 's'}
            </span>
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          {!klass.is_archived && visibleAvatars.length > 0 ? (
            <AvatarStack avatars={visibleAvatars} overflow={overflow} />
          ) : (
            <span />
          )}
          <StatusPill archived={klass.is_archived} />
        </div>
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

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

  const palette = [
    'bg-rose-200 text-rose-800',
    'bg-amber-200 text-amber-800',
    'bg-emerald-200 text-emerald-800',
    'bg-sky-200 text-sky-800',
    'bg-violet-200 text-violet-800',
    'bg-pink-200 text-pink-800',
  ];
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
        Past
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
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900">Leave this class?</h2>
        <p className="mt-2 text-sm text-gray-700">
          You&apos;ll lose access to <strong>{klass.name}</strong>&apos;s materials and
          grades. You can request to join again later if you change your mind.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
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