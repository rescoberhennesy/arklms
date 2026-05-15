
// src/components/dashboard/ProgressBar.tsx
'use client';

interface ProgressBarProps {
  done: number;
  total: number;
  label?: string;        // optional left-side label (e.g., "Prelim")
  showCount?: boolean;   // shows "3 / 10" on the right
  showPercent?: boolean; // shows "30%" on the right (mutually exclusive w/ showCount)
  size?: 'sm' | 'md';
  accent?: 'blue' | 'purple' | 'amber' | 'rose' | 'green' | 'gray';
}

const ACCENT_FILL: Record<NonNullable<ProgressBarProps['accent']>, string> = {
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  green: 'bg-green-500',
  gray: 'bg-gray-400',
};

const ACCENT_TEXT: Record<NonNullable<ProgressBarProps['accent']>, string> = {
  blue: 'text-blue-700',
  purple: 'text-purple-700',
  amber: 'text-amber-700',
  rose: 'text-rose-700',
  green: 'text-green-700',
  gray: 'text-gray-700',
};

export default function ProgressBar({
  done,
  total,
  label,
  showCount = true,
  showPercent = false,
  size = 'md',
  accent = 'green',
}: ProgressBarProps) {
  const safeTotal = Math.max(0, total);
  const safeDone = Math.max(0, Math.min(done, safeTotal));
  const pct = safeTotal === 0 ? 0 : Math.round((safeDone / safeTotal) * 100);

  const heightClass = size === 'sm' ? 'h-1.5' : 'h-2.5';
  const fillClass = ACCENT_FILL[accent];
  const textClass = ACCENT_TEXT[accent];

  return (
    <div className="w-full">
      {(label || showCount || showPercent) && (
        <div className="mb-1 flex items-center justify-between text-xs">
          {label ? (
            <span className={`font-medium ${textClass}`}>{label}</span>
          ) : (
            <span />
          )}
          {showPercent ? (
            <span className="font-medium text-gray-700">{pct}%</span>
          ) : showCount ? (
            <span className="font-medium text-gray-700">
              {safeDone} / {safeTotal}
            </span>
          ) : null}
        </div>
      )}
      <div
        className={`w-full overflow-hidden rounded-full bg-gray-100 ${heightClass}`}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ? `${label} progress` : 'progress'}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${fillClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
