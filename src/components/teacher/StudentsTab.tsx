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
  username: string | null;
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

type PendingConfirm =
  | { kind: 'remove'; studentId: string; name: string }
  | { kind: 'approve'; request: PendingJoinRequest }
  | { kind: 'reject'; request: PendingJoinRequest };

function formatLastActive(iso: string | null): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Never';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'Just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function activityDotClass(iso: string | null): string {
  if (!iso) return 'border border-zinc-300 bg-transparent';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return 'border border-zinc-300 bg-transparent';
  return diff < 24 * 3_600_000 ? 'bg-emerald-500' : 'bg-zinc-300';
}

function fmtJoined(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function confirmCopy(c: PendingConfirm | null) {
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

const CARD =
  'overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]';

export function StudentsTab({ classId, initialPending, initialRoster }: StudentsTabProps) {
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
              username: null,
              email: request.student_email,
              avatar_url: request.student_avatar_url,
              enrolled_at: new Date().toISOString(),
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
    if (confirm.kind === 'remove') handleRemove(confirm.studentId);
    else handleDecide(confirm.request, confirm.kind === 'approve');
  }

  const copy = confirmCopy(confirm);

  return (
    <div className="space-y-6">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

      {pending.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-zinc-900">
            <UserPlus className="h-4 w-4" />
            Pending requests ({pending.length})
          </h2>
          <ul className={`${CARD} divide-y divide-zinc-100`}>
            {pending.map((req) => (
              <li key={req.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <PersonAvatar
                    id={req.student_id}
                    name={req.student_full_name ?? req.student_email ?? 'Student'}
                    url={req.student_avatar_url}
                    size={36}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-900">
                      {req.student_full_name ?? '(unnamed student)'}
                    </p>
                    <p className="truncate text-xs text-zinc-500">{req.student_email}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirm({ kind: 'reject', request: req })}
                    disabled={busyId === req.id}
                    className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm({ kind: 'approve', request: req })}
                    disabled={busyId === req.id}
                    className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-red-600 px-3 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="@container">
        <h2 className="mb-3 text-[15px] font-bold text-zinc-900">Enrolled students ({roster.length})</h2>

        {roster.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-sm text-zinc-500">
            No students yet. Share the invite code or link to get started.
          </div>
        ) : (
          <div className={CARD}>
            {/* Column labels (wide only) */}
            <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_120px_120px_44px] gap-4 border-b border-zinc-100 bg-zinc-50/60 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 @3xl:grid">
              <span>Student</span>
              <span>Email</span>
              <span>Last active</span>
              <span>Joined</span>
              <span className="sr-only">Actions</span>
            </div>

            <ul className="divide-y divide-zinc-100">
              {roster.map((s) => {
                const name = s.full_name ?? s.email ?? 'Student';
                return (
                  <li
                    key={s.student_id}
                    className="flex items-center gap-3 px-4 py-3 @3xl:grid @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_120px_120px_44px] @3xl:gap-4"
                  >
                    {/* Student */}
                    <button
                      type="button"
                      onClick={() => setSelected(s)}
                      className="group flex min-w-0 flex-1 items-center gap-3 text-left"
                      aria-label={`View ${name}'s profile`}
                    >
                      <PersonAvatar id={s.student_id} name={name} url={s.avatar_url} size={36} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-zinc-900 group-hover:underline">
                          {s.full_name ?? '—'}
                        </span>
                        <span className="block truncate text-xs text-zinc-500">
                          {s.username ? `@${s.username}` : s.email}
                        </span>
                        {/* Narrow-only details */}
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 @3xl:hidden">
                          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${activityDotClass(s.last_active_at)}`} />
                          Active {formatLastActive(s.last_active_at).toLowerCase()} · Joined {fmtJoined(s.enrolled_at)}
                        </span>
                      </span>
                    </button>

                    {/* Wide-only columns */}
                    <span className="hidden truncate text-sm text-zinc-700 @3xl:block">{s.email ?? '—'}</span>
                    <span className="hidden items-center gap-1.5 whitespace-nowrap text-sm text-zinc-600 @3xl:flex">
                      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${activityDotClass(s.last_active_at)}`} />
                      {formatLastActive(s.last_active_at)}
                    </span>
                    <span className="hidden whitespace-nowrap text-sm text-zinc-500 @3xl:block">{fmtJoined(s.enrolled_at)}</span>

                    {/* Remove */}
                    <button
                      type="button"
                      onClick={() => setConfirm({ kind: 'remove', studentId: s.student_id, name })}
                      disabled={busyId === s.student_id}
                      aria-label={`Remove ${name}`}
                      title="Remove from class"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {selected && (
        <ProfileCard
          id={selected.student_id}
          name={selected.full_name ?? selected.email ?? 'Student'}
          username={selected.username}
          avatarUrl={selected.avatar_url}
          roleLabel="Student"
          viewerRole="teacher"
          details={[
            { label: 'Last active', value: formatLastActive(selected.last_active_at) },
            { label: 'Joined', value: fmtJoined(selected.enrolled_at) },
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