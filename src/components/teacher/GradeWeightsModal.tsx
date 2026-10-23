'use client';

import { useState, useEffect, useTransition } from 'react';
import { X, Save, Loader2, Scale, Check } from 'lucide-react';
import { createGradeWeights, updateGradeWeights } from '@/lib/actions/activities';
import type { ClassGradeWeights } from '@/lib/types/activities';
import { MODULE_TERM_LABELS } from '@/lib/types/modules';

interface GradeWeightsModalProps {
  open: boolean;
  classId: string;
  weights: ClassGradeWeights | null;
  onClose: () => void;
}

type Method = 'raw' | 'deped';

type Form = {
  prelimPct: string;
  midtermPct: string;
  finalPct: string;
  passingGrade: string;
  method: Method;
};

const EMPTY_FORM: Form = { prelimPct: '', midtermPct: '', finalPct: '', passingGrade: '75', method: 'raw' };

function toForm(w: ClassGradeWeights): Form {
  return {
    prelimPct: String(w.prelimPct),
    midtermPct: String(w.midtermPct),
    finalPct: String(w.finalPct),
    passingGrade: String(w.passingGrade ?? 75),
    method: w.gradingMethod ?? 'raw',
  };
}

function parseField(v: string, min = 0): number | null {
  const t = v.trim();
  if (t === '' || !/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n < min || n > 100 ? null : n;
}

export default function GradeWeightsModal({ open, classId, weights, onClose }: GradeWeightsModalProps) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<Form>(weights ? toForm(weights) : EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(weights ? toForm(weights) : EMPTY_FORM);
    setError(null);
  }, [open, weights]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, pending]);

  if (!open) return null;

  const p = {
    prelim: parseField(form.prelimPct),
    midterm: parseField(form.midtermPct),
    final: parseField(form.finalPct),
    passing: parseField(form.passingGrade, 1),
  };
  const weightsValid = p.prelim !== null && p.midterm !== null && p.final !== null;
  const liveSum = weightsValid ? (p.prelim as number) + (p.midterm as number) + (p.final as number) : null;
  const sumOk = liveSum !== null && Math.abs(liveSum - 100) < 0.01;
  const passingOk = p.passing !== null;

  const weightsExist = weights !== null;
  const original = weights ? toForm(weights) : null;
  const isDirty =
    !original ||
    original.prelimPct !== form.prelimPct ||
    original.midtermPct !== form.midtermPct ||
    original.finalPct !== form.finalPct ||
    original.passingGrade !== form.passingGrade ||
    original.method !== form.method;

  function set<K extends keyof Form>(key: K, v: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: v }));
    setError(null);
  }

  function handleSave() {
    if (!weightsValid) return setError('Enter a number from 0 to 100 for each grading period.');
    if (!sumOk) return setError(`Weights must add up to 100. Currently ${liveSum}.`);
    if (!passingOk) return setError('Passing grade must be a whole number from 1 to 100.');
    setError(null);
    const payload = {
      prelimPct: p.prelim as number,
      midtermPct: p.midterm as number,
      prefinalPct: 0,
      finalPct: p.final as number,
      passingGrade: p.passing as number,
      gradingMethod: form.method,
    };
    startTransition(async () => {
      try {
        if (weightsExist) await updateGradeWeights(classId, payload);
        else await createGradeWeights(classId, payload);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save');
      }
    });
  }

  const sumBadge =
    liveSum === null ? 'bg-zinc-100 text-zinc-600' : sumOk ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="grading-settings-title"
      onClick={() => !pending && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
          <h2 id="grading-settings-title" className="flex items-center gap-2 text-base font-bold text-zinc-900">
            <Scale className="h-4 w-4 text-zinc-500" />
            Grading settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
            className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* Weights */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Term weights</p>
            {(
              [
                ['prelimPct', MODULE_TERM_LABELS.prelim],
                ['midtermPct', MODULE_TERM_LABELS.midterm],
                ['finalPct', MODULE_TERM_LABELS.final],
              ] as const
            ).map(([key, label]) => (
              <NumField
                key={key}
                label={label}
                suffix="%"
                value={form[key]}
                onChange={(v) => set(key, v)}
                disabled={pending}
              />
            ))}
            <div className="flex items-center justify-between border-t border-zinc-100 pt-2.5">
              <span className="text-xs font-semibold text-zinc-700">Total</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${sumBadge}`}>
                {liveSum !== null ? `${liveSum} / 100` : '— / 100'}
              </span>
            </div>
          </div>

          {/* Passing + method */}
          <div className="space-y-3 border-t border-zinc-100 pt-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Passing</p>
            <NumField
              label="Passing grade"
              value={form.passingGrade}
              onChange={(v) => set('passingGrade', v)}
              disabled={pending}
            />
            <div>
              <p className="mb-1.5 text-sm text-zinc-700">Grading method</p>
              <div className="grid gap-2">
                {(
                  [
                    ['raw', 'Raw percentage', 'Points earned ÷ total points. Example: 26/35 = 74.3%.'],
                    ['deped', 'DepEd transmutation', 'Converts the raw % with DepEd’s table. Raw 60% → 75, raw 100% → 100.'],
                  ] as const
                ).map(([value, title, desc]) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition ${
                      form.method === value ? 'border-red-300 bg-red-50/50' : 'border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="grading-method"
                      checked={form.method === value}
                      onChange={() => set('method', value)}
                      disabled={pending}
                      className="mt-0.5 h-4 w-4 text-red-600 focus:ring-red-500"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-zinc-900">{title}</span>
                      <span className="block text-xs text-zinc-500">{desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            {isDirty ? 'Cancel' : 'Close'}
          </button>
          {weightsExist && !isDirty ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700">
              <Check className="h-4 w-4" />
              Saved
            </span>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={pending || !sumOk || !passingOk}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {weightsExist ? 'Save changes' : 'Save settings'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  disabled,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  suffix?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-zinc-700">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          placeholder="0"
          onChange={(e) => {
            const clean = e.target.value.replace(/\D/g, '').slice(0, 3);
            if (clean !== '' && Number(clean) > 100) return;
            onChange(clean);
          }}
          disabled={disabled}
          className="w-20 rounded-lg border border-zinc-200 px-2 py-1.5 text-right text-sm focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10 disabled:bg-zinc-50"
        />
        <span className="w-3 text-sm text-zinc-500">{suffix ?? ''}</span>
      </span>
    </label>
  );
}