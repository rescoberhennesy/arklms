'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { requestJoinClassByCode } from '@/lib/actions/enrollments';
import { DEFAULT_CLASS_COLOR } from '@/types/class';

type Props = {
  code: string;
  className: string;
  classSection: string | null;
  classSemester: string | null;
  classColor: string | null;
  teacherName: string | null;
};

export default function JoinConfirmCard({
  code,
  className,
  classSection,
  classSemester,
  classColor,
  teacherName,
}: Props) {
  const router = useRouter();
  const [submitted, setSubmitted] = useState <
    | { kind: 'idle' }
    | { kind: 'success'; message: string; classId: string | null }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const [isPending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      try {
        const result = await requestJoinClassByCode(code);
        if (result.kind === 'already_enrolled') {
          setSubmitted({
            kind: 'success',
            message: 'You are already enrolled in this class.',
            classId: result.class_id,
          });
        } else if (result.kind === 'request_pending') {
          setSubmitted({
            kind: 'success',
            message: 'You already have a pending request for this class.',
            classId: result.class_id,
          });
        } else {
          setSubmitted({
            kind: 'success',
            message: 'Request submitted. Awaiting teacher approval.',
            classId: result.class_id,
          });
        }
        router.refresh();
      } catch (err) {
        setSubmitted({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to join class',
        });
      }
    });
  }

  const color = classColor ?? DEFAULT_CLASS_COLOR;

  if (submitted.kind === 'success') {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <p className="text-sm font-medium text-green-800">{submitted.message}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/student/classes"
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Go to my classes
          </Link>
          <Link
            href="/student/dashboard"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="px-5 py-6" style={{ backgroundColor: color }}>
          <h2 className="text-2xl font-bold text-white drop-shadow-sm">
            {className}
          </h2>
          {classSection && (
            <p className="mt-1 text-sm font-medium text-white/90 drop-shadow-sm">
              {classSection}
            </p>
          )}
        </div>
        <div className="space-y-2 px-5 py-4 text-sm">
          {teacherName && (
            <p className="text-gray-700">
              <span className="text-gray-500">Teacher:</span>{' '}
              <span className="font-medium">{teacherName}</span>
            </p>
          )}
          {classSemester && (
            <p className="text-gray-700">
              <span className="text-gray-500">Semester:</span>{' '}
              <span className="font-medium">{classSemester}</span>
            </p>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-600">
        Confirm to send a join request to the teacher. You&apos;ll be enrolled
        once they approve.
      </p>

      {submitted.kind === 'error' && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {submitted.message}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={confirm}
          disabled={isPending}
          className="rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {isPending ? 'Submitting...' : 'Confirm and request to join'}
        </button>
        <Link
          href="/student/dashboard"
          className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
