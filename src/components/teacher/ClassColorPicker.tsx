// src/components/teacher/ClassColorPicker.tsx
'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { updateClassColor } from '@/lib/actions/classes';
import { CLASS_COLORS } from '@/types/class';
import { cn } from '@/lib/utils/cn';

interface ClassColorPickerProps {
  classId: string;
  initialColor: string | null;
}

export default function ClassColorPicker({
  classId,
  initialColor,
}: ClassColorPickerProps) {
  // Optimistic local color so the swatch ring jumps immediately on tap; if
  // the server action fails we roll back to the previous value.
  const [color, setColor] = useState<string>(initialColor ?? CLASS_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(false);
  const [pending, startTransition] = useTransition();

  function handlePick(next: string) {
    if (pending) return;
    if (next === color) return;
    const previous = color;
    setColor(next);
    setError(null);
    setSavedTick(false);

    startTransition(async () => {
      const res = await updateClassColor(classId, next);
      if (!res.ok) {
        setColor(previous);
        setError(res.error);
        return;
      }
      setSavedTick(true);
      // Tick fades shortly so it doesn't linger like a stuck status.
      setTimeout(() => setSavedTick(false), 1500);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {CLASS_COLORS.map((c) => {
          const isActive = c === color;
          return (
            <button
              key={c}
              type="button"
              onClick={() => handlePick(c)}
              disabled={pending}
              className={cn(
                'h-8 w-8 rounded-full ring-offset-2 transition disabled:cursor-not-allowed disabled:opacity-60',
                isActive ? 'ring-2 ring-gray-700' : 'hover:scale-110',
              )}
              style={{ backgroundColor: c }}
              aria-label={`Select color ${c}`}
              aria-pressed={isActive}
            />
          );
        })}

        {savedTick && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-green-700">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}