import { cn } from '@/lib/utils/cn';

const TRACK_COLORS: Record<string, string> = {
  ABM: 'bg-amber-100 text-amber-800',
  HUMSS: 'bg-sky-100 text-sky-800',
  'H.E': 'bg-rose-100 text-rose-800',
  ICT: 'bg-violet-100 text-violet-800',
};

export function TrackPill({ track }: { track: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
        TRACK_COLORS[track] ?? 'bg-gray-100 text-gray-700',
      )}
    >
      {track}
    </span>
  );
}