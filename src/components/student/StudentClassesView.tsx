'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cancelMyJoinRequest, dismissRejectedRequest, reorderMyEnrollments } from '@/lib/actions/enrollments';
import type { StudentClassListItem } from '@/types/class';
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
  const active = classes.filter((c) => !c.is_archived);
  const past = classes.filter((c) => c.is_archived);
  const [, startTransition] = useTransition();

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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">My classes</h1>
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

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          My classes
        </h2>
        {active.length === 0 && past.length === 0 ? (
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
        ) : active.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-center">
            <p className="text-sm text-gray-600">No active classes right now.</p>
          </div>
        ) : (
          <SortableClassGrid
            items={active}
            onReorder={handleReorder}
            renderItem={(klass) => (
              <SortableItem id={klass.id}>
                <StudentClassCard klass={klass} />
              </SortableItem>
            )}
          />
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Past classes
          </h2>
          <SortableClassGrid
            items={past}
            onReorder={() => {}}
            disabled
            renderItem={(klass) => (
              <StudentClassCard klass={klass} />
            )}
          />
        </section>
      )}

      <JoinClassModal open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  );
}

function StudentClassCard({ klass }: { klass: StudentClassListItem }) {
  return (
    <Link
      href={`/student/classes/${klass.id}`}
      className={
        klass.is_archived
          ? 'block overflow-hidden rounded-xl border border-gray-200 bg-white opacity-70 shadow-sm transition hover:opacity-100 hover:shadow-md'
          : 'block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md'
      }
    >
      <ClassCover
        url={klass.cover_photo_url}
        color={klass.color}
        className="h-24 w-full"
      >
        {klass.is_archived && (
          <span className="absolute right-2 top-2 z-10 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-700 shadow-sm">
            Archived
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3 className="line-clamp-2 text-base font-semibold text-white drop-shadow-sm">
            {klass.name}
          </h3>
          {klass.section && (
            <p className="text-xs text-white/90 drop-shadow-sm">{klass.section}</p>
          )}
        </div>
      </ClassCover>
      <div className="px-4 py-3">
        <p className="truncate text-sm text-gray-700">
          {klass.teacher_name ?? 'Teacher'}
        </p>
        <p className="text-xs text-gray-500">{klass.semester}</p>
      </div>
    </Link>
  );
}