import { cn } from '@/lib/utils/cn';
import { DEFAULT_CLASS_COLOR } from '@/types/class';

interface ClassCoverProps {
  /** Cover photo URL. If null/undefined, the color block is shown alone. */
  url?: string | null;
  /** Class color, used as solid background or as gradient tint over the photo. */
  color?: string | null;
  /** Tailwind classes to size/position the cover (e.g. 'h-28 w-full'). Required. */
  className: string;
  /**
   * Optional content rendered on top of the cover (typically the class name +
   * section, drop-shadowed for legibility). Caller positions it absolutely.
   */
  children?: React.ReactNode;
}

/**
 * Shared visual element for class covers across the app.
 *
 * - No photo: renders a solid color block with a subtle bottom-shadow gradient.
 * - With photo: renders the photo, with a bottom-shadow gradient AND a
 *   diagonal color-tint gradient so the class color stays recognizable in
 *   list views (matches the Google Classroom pattern).
 *
 * Sizing is the caller's responsibility via `className`.
 */
export default function ClassCover({
  url,
  color,
  className,
  children,
}: ClassCoverProps) {
  const resolvedColor = color ?? DEFAULT_CLASS_COLOR;
  const hasCover = !!url;

  return (
    <div
      className={cn('relative overflow-hidden', className)}
      style={hasCover ? undefined : { backgroundColor: resolvedColor }}
    >
      {hasCover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url ?? ''}
          alt=""
          className="h-full w-full object-cover"
        />
      )}
      {/* Color tint over photo -- preserves class identity in list views. */}
      {hasCover && (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${resolvedColor}40, ${resolvedColor}00 50%, ${resolvedColor}20)`,
          }}
        />
      )}
      {/* Bottom shadow gradient -- improves text legibility for overlay content. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-black/0 to-black/15"
      />
      {children}
    </div>
  );
}
