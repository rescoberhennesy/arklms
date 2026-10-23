'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, Check, Loader2 } from 'lucide-react';
import {
  listIncomingTransfers,
  respondClassTransfer,
  type IncomingTransfer,
} from '@/lib/actions/classTransfers';

export default function IncomingTransfers() {
  const router = useRouter();
  const [items, setItems] = useState<IncomingTransfer[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listIncomingTransfers().then(setItems);
  }, []);

  async function respond(t: IncomingTransfer, accept: boolean) {
    setBusyId(t.requestId);
    setError(null);
    const res = await respondClassTransfer(t.requestId, accept);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      setItems(await listIncomingTransfers());
      return;
    }
    if (accept) {
      router.push(`/teacher/classes/${res.data.classId}`);
    } else {
      setItems((prev) => prev.filter((x) => x.requestId !== t.requestId));
    }
  }

  if (items.length === 0 && !error) return null;

  return (
    <section className="mb-6 space-y-3">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}
      {items.map((t) => (
        <div
          key={t.requestId}
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <ArrowRightLeft className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-stone-900">
                {t.fromName} wants to hand over {t.className}
                {t.classSection ? ` (${t.classSection})` : ''} to you
              </p>
              <p className="text-xs text-stone-600">
                {t.studentCount} student{t.studentCount === 1 ? '' : 's'} · all modules, activities and grades
                come with it
              </p>
              {t.note && <p className="mt-1 text-xs italic text-stone-700">“{t.note}”</p>}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => respond(t, false)}
              disabled={busyId !== null}
              className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => respond(t, true)}
              disabled={busyId !== null}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {busyId === t.requestId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Accept class
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}