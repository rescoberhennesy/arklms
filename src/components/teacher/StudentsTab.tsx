'use client';

import { useState, useTransition } from 'react';
import { Check, X, Trash2, UserPlus } from 'lucide-react';
import { decideJoinRequest, removeEnrollment } from '@/lib/actions/enrollments';
import type { PendingJoinRequest } from '@/types/class';
import { PersonAvatar, ProfileCard } from '@/components/dashboard/ProfileCard';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';

interface RosterEntry {
  student_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  enrolled_at: string;
  last_active_at: string | null;
}

interface StudentsTabProps {
  classId: string;
  initialPending: PendingJoinRequest[];
  initialRoster: RosterEntry[];
}

// What the confirmation dialog is currently asking about
type PendingConfirm =
  | { kind: 'remove'; studentId: string; name: string }
  | { kind: 'approve'; request: PendingJoinRequest }
  | { kind: 'reject'; request: PendingJoinRequest };

// Relative-time formatter for last_active_at. Mirrors the granularity
// used by the notification bell: minutes -> hours -> days -> date.
function formatLastActive(iso: string | null): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Never';
  const diff = Date.now() - then;
  if (diff < 0) return 'Just now'; // clock skew guard
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Dot color buckets:
//   - green: active within the last 24h
//   - gray:  seen, but more than 24h ago
//   - hollow: never seen since the column shipped (last_active_at null)
function activityDotClass(iso: string | null): string {
  if (!iso) return 'border border-gray-300 bg-transparent';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'border border-gray-300 bg-transparent';
  const diff = Date.now() - then;
  if (diff < 24 * 3_600_000) return 'bg-green-500';
  return 'bg-gray-300';
}

function confirmCopy(c: PendingConfirm | null): {
  title: string;
  message: string;
  confirmLabel: string;
  destructive: boolean;
} {
  if (!c) return { title: '', message: '', confirmLabel: '', destructive: false };

  if (c.kind === 'remove') {
    return {
      title: `Remove ${c.name} from this class?`,
      message:
        "They'll lose access to this class's modules, activities and quizzes. Their submissions and grades are kept, and they can rejoin with the class code.",
      confirmLabel: 'Remove student',
      destructive: true,
    };
  }

  const name = c.request.student_full_name ?? 'this student';
  if (c.kind === 'reject') {
    return {
      title: `Reject ${name}'s request?`,
      message: "They won't be added to the class. They can send a new request later if needed.",
      confirmLabel: 'Reject request',
      destructive: true,
    };
  }

  return {
    title: `Approve ${name}?`,
    message: `${c.request.student_email ?? 'This student'} will be added to the class and can see everything you've published.`,
    confirmLabel: 'Approve',
    destructive: false,
  };
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
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [selected, setSelected] = useState<RosterEntry | null>(null);
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
              // A just-approved student has no recorded activity yet.
              last_active_at: null,
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

  function handleConfirmed() {
    if (!confirm) return;
    if (confirm.kind === 'remove') {
      handleRemove(confirm.studentId);
    } else {
      handleDecide(confirm.request, confirm.kind === 'approve');
    }
  }

  const copy = confirmCopy(confirm);

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
                    onClick={() => setConfirm({ kind: 'approve', request: req })}
                    disabled={busyId === req.id}
                    className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm({ kind: 'reject', request: req })}
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
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Last active</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Joined</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {roster.map((s) => (
                  <tr key={s.student_id}>
                    <td className="px-4 py-3">
  <button
    type="button"
    onClick={() => setSelected(s)}
    className="group flex items-center gap-3 text-left"
    aria-label={`View ${s.full_name ?? s.email ?? 'student'}'s profile`}
  >
    <PersonAvatar id={s.student_id} name={s.full_name ?? s.email ?? 'Student'} url={s.avatar_url} size={32} />
    <span className="text-sm font-medium text-gray-900 group-hover:underline">{s.full_name ?? '—'}</span>
  </button>
</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{s.email ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className={`h-2 w-2 shrink-0 rounded-full ${activityDotClass(
                            s.last_active_at,
                          )}`}
                        />
                        <span
                          className={
                            s.last_active_at ? 'text-gray-600' : 'text-gray-400'
                          }
                        >
                          {formatLastActive(s.last_active_at)}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(s.enrolled_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setConfirm({
                            kind: 'remove',
                            studentId: s.student_id,
                            name: s.full_name ?? s.email ?? 'this student',
                          })
                        }
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

            {selected && (
        <ProfileCard
          id={selected.student_id}
          name={selected.full_name ?? selected.email ?? 'Student'}
          avatarUrl={selected.avatar_url}
          roleLabel="Student"
          viewerRole="teacher"
          details={[
            { label: 'Last active', value: formatLastActive(selected.last_active_at) },
            { label: 'Joined', value: new Date(selected.enrolled_at).toLocaleDateString() },
          ]}
          onClose={() => setSelected(null)}
        />
      )}


      <ConfirmDialog
        open={confirm !== null}
        title={copy.title}
        message={copy.message}
        confirmLabel={copy.confirmLabel}
        destructive={copy.destructive}
        onConfirm={handleConfirmed}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}