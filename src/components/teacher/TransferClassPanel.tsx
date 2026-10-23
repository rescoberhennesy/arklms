'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, Clock, Loader2, X } from 'lucide-react';
import {
  requestClassTransfer,
  cancelClassTransfer,
  type PendingTransfer,
} from '@/lib/actions/classTransfers';

export default function TransferClassPanel({
  classId,
  pending,
}: {
  classId: string;
  pending: PendingTransfer | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function send() {
    setError(null);
    if (!email.trim()) {
      setError('Enter the replacement teacher’s school email.');
      return;
    }
    startTransition(async () => {
      const res = await requestClassTransfer(classId, email, note);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEmail('');
      setNote('');
      router.refresh();
    });
  }

  function cancel() {
    if (!pending) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelClassTransfer(pending.requestId, classId);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  if (pending) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2.5">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">Waiting for {pending.toName} to accept</p>
              <p className="text-xs text-amber-800">
                Sent to {pending.toEmail}. You still handle this class until they accept.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Cancel request
          </button>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="transfer-email" className="mb-1 block text-xs font-semibold text-gray-700">
            Replacement teacher’s school email
          </label>
          <input
            id="transfer-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@arklms.institute"
            disabled={busy}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10 disabled:opacity-60"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="transfer-note" className="mb-1 block text-xs font-semibold text-gray-700">
            Note <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            id="transfer-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="e.g. Prelim grades are done. Midterm modules are still drafts."
            disabled={busy}
            className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10 disabled:opacity-60"
          />
        </div>
      </div>

      <p className="text-xs text-gray-500">
        They must already have a teacher account. Once they accept, they get all modules, activities,
        submissions and grades, students stay enrolled, and you lose access to this class.
      </p>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <button
        type="button"
        onClick={send}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
        Send transfer request
      </button>
    </div>
  );
}