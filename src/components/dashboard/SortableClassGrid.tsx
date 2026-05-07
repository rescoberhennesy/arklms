'use client';

import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useState } from 'react';

interface SortableItemLike {
  id: string;
}

interface SortableClassGridProps<T extends SortableItemLike> {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  renderItem: (item: T) => React.ReactNode;
  /** Tailwind class for the grid container. Defaults to a 1/2/3-column responsive grid. */
  className?: string;
  /** When true, dragging is disabled but items still render. */
  disabled?: boolean;
}

const DEFAULT_GRID_CLASS =
  'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3';

/**
 * Generic drag-and-drop grid for class cards.
 *
 * Manages local optimistic state so reordering feels instant; the parent's
 * onReorder is called after the drag ends with the final ID order. The parent
 * is responsible for persisting via a server action AND for re-syncing items
 * if the server rejects the change.
 */
export default function SortableClassGrid<T extends SortableItemLike>({
  items,
  onReorder,
  renderItem,
  className = DEFAULT_GRID_CLASS,
  disabled = false,
}: SortableClassGridProps<T>) {
  // Optimistic local order. We mirror parent props but allow drag to mutate
  // immediately. When parent's `items` prop changes (e.g. after a server
  // refresh), we sync our local order to it.
  const [localItems, setLocalItems] = useState(items);

  // If parent items change identity (different ids or different order from
  // a server refresh), reset our local order to match.
  const parentIds = items.map((i) => i.id).join(',');
  const localIds = localItems.map((i) => i.id).join(',');
  if (parentIds !== localIds) {
    setLocalItems(items);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require small movement before drag starts -- prevents accidental drags
      // on tap-and-release in mobile / trackpad clicks.
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localItems.findIndex((i) => i.id === active.id);
    const newIndex = localItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const next = arrayMove(localItems, oldIndex, newIndex);
    setLocalItems(next);
    onReorder(next.map((i) => i.id));
  }

  if (disabled) {
    return (
      <div className={className}>
        {localItems.map((item) => (
          <div key={item.id}>{renderItem(item)}</div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={localItems.map((i) => i.id)}
        strategy={rectSortingStrategy}
      >
        <div className={className}>
          {localItems.map((item) => (
            <div key={item.id}>{renderItem(item)}</div>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
