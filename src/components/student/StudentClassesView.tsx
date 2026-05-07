'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cancelMyJoinRequest } from '@/lib/actions/enrollments';
import type { StudentClassListItem } from '@/types/class';
import JoinClassModal from './JoinClassModal';

type PendingRequest = {
  id: string;
  class_id: string;
  class_name: string;
  requested_at: string;
};

type Props = {
  enrolledClasses: StudentClassListItem[];
  pendingRequests: PendingRequest[];
};

export default function StudentClassesView({
  enrolledClasses,
  pendingRequests,
}: Props) {
  const router = useRouter();
  const [joinOpen, setJoinOpen] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Enrolled classes
        </h2>
        {enrolledClasses.length === 0 ? (
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
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enrolledClasses.map((klass) => (
              <StudentClassCard key={klass.id} klass={klass} />
            ))}
          </div>
        )}
      </section>

      <JoinClassModal open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  );
}

function StudentClassCard({ klass }: { klass: StudentClassListItem }) {
  const color = klass.color || '#fecaca';
  return (
    <Link
      href={`/student/classes/${klass.id}`}
      className="group block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <div
        className="relative h-24 px-4 py-3"
        style={{ backgroundColor: color }}
      >
        <h3 className="line-clamp-2 text-base font-semibold text-white drop-shadow-sm">
          {klass.name}
        </h3>
        <p className="text-xs text-white/90 drop-shadow-sm">{klass.section}</p>
      </div>
      <div className="px-4 py-3">
        <p className="truncate text-sm text-gray-700">
          {klass.teacher_name ?? 'Teacher'}
        </p>
        <p className="text-xs text-gray-500">{klass.semester}</p>
      </div>
    </Link>
  );
}