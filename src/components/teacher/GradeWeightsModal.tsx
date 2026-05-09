'use client';

import { useState, useEffect, useTransition } from 'react';
import { X, Save, Loader2, Scale } from 'lucide-react';
import {
  createGradeWeights,
  updateGradeWeights,
} from '@/lib/actions/activities';
import type { ClassGradeWeights } from '@/lib/types/activities';
import { MODULE_TERM_LABELS } from '@/lib/types/modules';

interface GradeWeightsModalProps {
  open: boolean;
  classId: string;
  // Existing weights, or null if no row exists yet for this class.
  // Determines whether Save calls createGradeWeights or updateGradeWeights.
  weights: ClassGradeWeights | null;
  onClose: () => void;
}

type WeightsForm = {
  prelimPct: string;
  midtermPct: string;
  prefinalPct: string;
  finalPct: string;
};

const DEFAULT_FORM: WeightsForm = {
  prelimPct: '25',
  midtermPct: '25',
  prefinalPct: '25',
  finalPct: '25',
};

function weightsToForm(w: ClassGradeWeights): WeightsForm {
  return {
    prelimPct: String(w.prelimPct),
    midtermPct: String(w.midtermPct),
    prefinalPct: String(w.prefinalPct),
    finalPct: String(w.finalPct),
  };
}

function parseField(v: string): number | null {
  const trimmed = v.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

export default function GradeWeightsModal({
  open,
  classId,
  weights,
  onClose,
}: GradeWeightsModalProps) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<WeightsForm>(
    weights ? weightsToForm(weights) : DEFAULT_FORM,
  );
  const [error, setError] = useState<string | null>(null);

  // When modal opens (or when the weights prop changes between opens),
  // reset the form to reflect the latest persisted weights. Using the
  // prop-sync pattern instead of re-fetching keeps the modal cheap and
  // ensures the parent's view of weights is the source of truth.
  useEffect(() => {
    if (!open) return;
    setForm(weights ? weightsToForm(weights) : DEFAULT_FORM);
    setError(null);
  }, [open, weights]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, pending]);

  if (!open) return null;

  // Live sum for the helper text. Falls back to 0 for unparseable fields.
  const parsed = {
    prelimPct: parseField(form.prelimPct),
    midtermPct: parseField(form.midtermPct),
    prefinalPct: parseField(form.prefinalPct),
    finalPct: parseField(form.finalPct),
  };
  const allValid = Object.values(parsed).every((v) => v !== null);
  const liveSum = allValid
    ? (parsed.prelimPct as number) +
      (parsed.midtermPct as number) +
      (parsed.prefinalPct as number) +
      (parsed.finalPct as number)
    : null;
  const sumOk = liveSum !== null && Math.abs(liveSum - 100) < 0.01;

  const weightsExist = weights !== null;

  function handleField(key: keyof WeightsForm, v: string) {
    setForm((prev) => ({ ...prev, [key]: v }));
    setError(null);
  }

  function handleSave() {
    if (!allValid) {
      setError('Each weight must be a number between 0 and 100.');
      return;
    }
    if (!sumOk) {
      setError(
        `Weights must sum to 100. Currently ${(liveSum as number).toFixed(2)}.`,
      );
      return;
    }
    setError(null);
    const payload = {
      prelimPct: parsed.prelimPct as number,
      midtermPct: parsed.midtermPct as number,
      prefinalPct: parsed.prefinalPct as number,
      finalPct: parsed.finalPct as number,
    };
    startTransition(async () => {
      try {
        if (weightsExist) {
          await updateGradeWeights(classId, payload);
        } else {
          await createGradeWeights(classId, payload);
        }
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save');
      }
    });
  }

  function handleResetEqual() {
    setForm(DEFAULT_FORM);
    setError(null);
  }

  // Color the sum badge based on validity
  let sumBadgeClass = 'bg-gray-100 text-gray-600';
  if (liveSum !== null) {
    sumBadgeClass = sumOk
      ? 'bg-green-100 text-green-800'
      : 'bg-red-100 text-red-800';
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="grade-weights-modal-title"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2
            id="grade-weights-modal-title"
            className="flex items-center gap-2 text-base font-semibold text-gray-900"
          >
            <Scale className="h-4 w-4 text-gray-500" />
            Grade weights
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          <p className="text-xs text-gray-600">
            Weights determine each term&apos;s contribution to the final grade.
            Values must sum to 100.
            {!weightsExist && (
              <>
                {' '}
                <span className="font-medium text-gray-700">
                  This class is currently unweighted.
                </span>{' '}
                Saving will create weights for this class.
              </>
            )}
          </p>

          <div className="space-y-3">
            <WeightField
              label={MODULE_TERM_LABELS.prelim}
              value={form.prelimPct}
              onChange={(v) => handleField('prelimPct', v)}
              disabled={pending}
            />
            <WeightField
              label={MODULE_TERM_LABELS.midterm}
              value={form.midtermPct}
              onChange={(v) => handleField('midtermPct', v)}
              disabled={pending}
            />
            <WeightField
              label={MODULE_TERM_LABELS.prefinal}
              value={form.prefinalPct}
              onChange={(v) => handleField('prefinalPct', v)}
              disabled={pending}
            />
            <WeightField
              label={MODULE_TERM_LABELS.final}
              value={form.finalPct}
              onChange={(v) => handleField('finalPct', v)}
              disabled={pending}
            />
          </div>

          {/* Live sum */}
          <div className="flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="text-xs font-medium text-gray-700">Sum</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${sumBadgeClass}`}
            >
              {liveSum !== null ? `${liveSum.toFixed(2)} / 100` : '— / 100'}
            </span>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
          <button
            type="button"
            onClick={handleResetEqual}
            disabled={pending}
            className="text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-60"
          >
            Reset to equal (25/25/25/25)
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending || !sumOk}
              className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {weightsExist ? 'Save' : 'Create weights'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Reusable field row ---------------------------------------------------

interface WeightFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}

function WeightField({ label, value, onChange, disabled }: WeightFieldProps) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={100}
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-20 rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:bg-gray-50"
        />
        <span className="text-sm text-gray-500">%</span>
      </div>
    </label>
  );
}