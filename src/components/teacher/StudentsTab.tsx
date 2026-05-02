'use client';

import { useState, useTransition } from 'react';
import { Check, X, Trash2, UserPlus } from 'lucide-react';
import { decideJoinRequest, removeEnrollment } from '@/lib/actions/enrollments';
import type { PendingJoinRequest } from '@/types/class';

interface RosterEntry {
  student_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  enrolled_at: string;
}

interface StudentsTabProps {
  classId: string;
  initialPending: PendingJoinRequest[];
  initialRoster: RosterEntry[];
}

export function StudentsTab({
  classId,
  initialPending,
  initialRoster,
}: StudentsTabProps) {
  const [pending, setPending] = useState(initialPending);
  const [roster, setRoster] = useState(initialRoster);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDecide(request: PendingJoinRequest, approve: boolean) {
    setError(null);
    setBusyId(request.id);
    startTransition(async () => {
      try {
        await decideJoinRequest(request.id, approve, classId);
        setPending((prev) => prev.filter((r) => r.id !== request.id));
        if (approve) {
          setRoster((prev) => [
            ...prev,
            {
              student_id: request.student_id,
              full_name: request.student_full_name,
              email: request.student_email,
              avatar_url: request.student_avatar_url,
              enrolled_at: new Date().toISOString(),
            },
          ]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update request');
      } finally {
        setBusyId(null);
      }
    });
  }

  function handleRemove(studentId: string) {
    setError(null);
    setBusyId(studentId);
    startTransition(async () => {
      try {
        await removeEnrollment(classId, studentId);
        setRoster((prev) => prev.filter((r) => r.student_id !== studentId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove student');
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {pending.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <UserPlus className="h-4 w-4" />
            Pending requests ({pending.length})
          </h2>
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {pending.map((req) => (
              <li
                key={req.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {req.student_full_name ?? '(unnamed student)'}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {req.student_email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDecide(req, true)}
                    disabled={busyId === req.id}
                    className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDecide(req, false)}
                    disabled={busyId === req.id}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">
          Enrolled students ({roster.length})
        </h2>

        {roster.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
            <p className="text-sm text-gray-600">
              No students yet. Share the invite code or link to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Student</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Joined</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {roster.map((s) => (
                  <tr key={s.student_id}>
                    <td className="px-4 py-3 text-sm text-gray-900">{s.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{s.email ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(s.enrolled_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemove(s.student_id)}
                        disabled={busyId === s.student_id}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
