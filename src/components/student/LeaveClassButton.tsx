'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { leaveClass } from '@/lib/actions/enrollments';

interface LeaveClassButtonProps {
  classId: string;
  className: string;
}

/**
 * Top-right action button on the student class detail page.
 * Opens a confirmation dialog; on confirm, deletes the student's enrollment
 * and redirects to /student/classes.
 */
export default function LeaveClassButton({
  classId,
  className,
}: LeaveClassButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await leaveClass(classId);
        router.replace('/student/classes');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not leave class');
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-white/30"
        aria-label="Leave class"
      >
        <LogOut className="h-4 w-4" />
        Leave class
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900">
              Leave this class?
            </h2>
            <p className="mt-2 text-sm text-gray-700">
              You&apos;ll lose access to <strong>{className}</strong>&apos;s
              materials and grades. You can request to join again later if you
              change your mind.
            </p>

            {error && (
              <p className="mt-3 text-sm text-red-600">{error}</p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
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
      )}
    </>
  );
}
