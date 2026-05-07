'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
  /** Position of the drag handle. Defaults to top-left. */
  handlePosition?: 'top-left' | 'top-right';
}

/**
 * Wraps any item in a sortable container with a drag handle.
 *
 * The handle (grip icon) is the ONLY drag target -- the rest of the child
 * content remains clickable for navigation, menu interactions, etc.
 *
 * The handle is hidden by default, shown on hover or keyboard focus of the
 * containing item, matching the visual pattern of the existing 3-dot menu.
 */
export default function SortableItem({
  id,
  children,
  handlePosition = 'top-left',
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const handleClasses = cn(
    'absolute z-10 rounded-full bg-white/85 p-1.5 text-gray-700 shadow-sm hover:bg-white',
    'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
    'cursor-grab active:cursor-grabbing',
    handlePosition === 'top-left' ? 'left-2 top-2' : 'right-2 top-2',
  );

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className={handleClasses}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}
