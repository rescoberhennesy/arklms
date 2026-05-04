'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { requestJoinClassByCode } from '@/lib/actions/enrollments';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function JoinClassModal({ open, onClose }: Props) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [feedback, setFeedback] = useState <
    | { kind: 'idle' }
    | { kind: 'error'; message: string }
    | { kind: 'success'; message: string }
  >({ kind: 'idle' });
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  function close() {
    setCode('');
    setFeedback({ kind: 'idle' });
    onClose();
  }

  function submit() {
    const trimmed = code.trim();
    if (!trimmed) {
      setFeedback({ kind: 'error', message: 'Please enter an invite code' });
      return;
    }
    startTransition(async () => {
      try {
        const result = await requestJoinClassByCode(trimmed);
        if (result.kind === 'already_enrolled') {
          setFeedback({
            kind: 'success',
            message: 'You are already enrolled in this class.',
          });
        } else if (result.kind === 'request_pending') {
          setFeedback({
            kind: 'success',
            message: 'You already have a pending request for this class.',
          });
        } else {
          setFeedback({
            kind: 'success',
            message: 'Request submitted. Awaiting teacher approval.',
          });
        }
        router.refresh();
      } catch (err) {
        setFeedback({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to join class',
        });
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-gray-900">Join a class</h2>
        <p className="mt-1 text-sm text-gray-600">
          Enter the 7-character invite code from your teacher.
        </p>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">
            Invite code
          </label>
          <input
            type="text"
            autoFocus
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toLowerCase());
              if (feedback.kind !== 'idle') setFeedback({ kind: 'idle' });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            maxLength={7}
            placeholder="abc23xy"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-lg tracking-wider focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>

        {feedback.kind === 'error' && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {feedback.message}
          </div>
        )}
        {feedback.kind === 'success' && (
          <div className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            {feedback.message}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {feedback.kind === 'success' ? 'Close' : 'Cancel'}
          </button>
          {feedback.kind !== 'success' && (
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? 'Joining...' : 'Join'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}