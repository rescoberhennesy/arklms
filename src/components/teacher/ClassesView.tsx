// src/components/teacher/ClassesView.tsx
'use client';

import { useState, useTransition } from 'react';
import { Plus, Check } from 'lucide-react';
import { ClassCard } from './ClassCard';
import { ClassFormModal } from './ClassFormModal';
import { ConfirmDialog } from './ConfirmDialog';
import {
  createClass,
  updateClass,
  setClassArchived,
  deleteClass,
  reorderMyClasses,
} from '@/lib/actions/classes';
import type { ClassFormInput, TeacherClassListItem } from '@/types/class';
import { useRouter } from 'next/navigation';
import SortableClassGrid from '@/components/dashboard/SortableClassGrid';
import SortableItem from '@/components/dashboard/SortableItem';

interface ClassesViewProps {
  initialClasses: TeacherClassListItem[];
  nameSuggestions: string[];
  sectionSuggestions: string[];
}

type FormState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; cls: TeacherClassListItem };

export function ClassesView({
  initialClasses,
  nameSuggestions,
  sectionSuggestions,
}: ClassesViewProps) {
  const router = useRouter();
  const [classes, setClasses] = useState(initialClasses);
  const [formState, setFormState] = useState<FormState>({ kind: 'closed' });
  const [deleteTarget, setDeleteTarget] = useState<TeacherClassListItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleReorder(orderedIds: string[]) {
    // Snapshot pre-drag order so we can roll back on server failure.
    const snapshot = classes;

    // Apply optimistically so `active` reflects the new order on the next
    // render. Without this the inline grid would snap back because the
    // parent's `classes` state still has the old order.
    setClasses((prev) => {
      const byId = new Map(prev.map((c) => [c.id, c]));
      const reordered = orderedIds
        .map((id) => byId.get(id))
        .filter((c): c is TeacherClassListItem => Boolean(c));
      // Append any items not in orderedIds (e.g. archived classes that
      // weren't part of the dragged set) so we don't drop them.
      const known = new Set(orderedIds);
      const rest = prev.filter((c) => !known.has(c.id));
      return [...reordered, ...rest];
    });

    const res = await reorderMyClasses(orderedIds);
    if (!res.ok) {
      setClasses(snapshot);
      showToast(res.error || 'Could not save new order');
    }
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleCopyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      showToast('Invite code copied');
    } catch {
      showToast('Could not copy code');
    }
  }

  async function handleSubmit(input: ClassFormInput) {
    if (formState.kind === 'edit') {
      const res = await updateClass(formState.cls.id, input);
      if (!res.ok) throw new Error(res.error);
      const updated = res.data;
      setClasses((prev) =>
        prev.map((c): TeacherClassListItem =>
          c.id === updated.id
            ? { ...updated, enrolled_count: c.enrolled_count }
            : c,
        ),
      );
      showToast('Class updated');
    } else {
      const res = await createClass(input);
      if (!res.ok) throw new Error(res.error);
      const created = res.data;
      const newItem: TeacherClassListItem = { ...created, enrolled_count: 0 };
      setClasses((prev) => [newItem, ...prev]);
      showToast('Class created');
    }
  }

  function handleToggleArchive(cls: TeacherClassListItem) {
    startTransition(async () => {
      const res = await setClassArchived(cls.id, !cls.is_archived);
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      setClasses((prev) =>
        prev.map((c) =>
          c.id === cls.id ? { ...c, is_archived: !c.is_archived } : c,
        ),
      );
      showToast(cls.is_archived ? 'Class unarchived' : 'Class archived');
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await deleteClass(deleteTarget.id);
    if (!res.ok) throw new Error(res.error);
    setClasses((prev) => prev.filter((c) => c.id !== deleteTarget.id));
    showToast('Class deleted');
  }

  const active = classes.filter((c) => !c.is_archived);
  const archived = classes.filter((c) => c.is_archived);

  return (
    <div className="w-full">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Classes</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {active.length} active{archived.length > 0 && `, ${archived.length} archived`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormState({ kind: 'create' })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          <Plus className="h-4 w-4" />
          Create class
        </button>
      </div>

      {classes.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <h3 className="text-base font-medium text-gray-900">No classes yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create your first class to get started.
          </p>
          <button
            type="button"
            onClick={() => setFormState({ kind: 'create' })}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            <Plus className="h-4 w-4" />
            Create class
          </button>
        </div>
      )}

      {active.length > 0 && (
        <SortableClassGrid
          items={active}
          onReorder={handleReorder}
          renderItem={(cls) => (
            <SortableItem id={cls.id}>
              <ClassCard
                cls={cls}
                onCopyCode={handleCopyCode}
                onEdit={(c) => setFormState({ kind: 'edit', cls: c as TeacherClassListItem })}
                onToggleArchive={handleToggleArchive}
                onDelete={(c) => setDeleteTarget(c as TeacherClassListItem)}
              />
            </SortableItem>
          )}
        />
      )}

      {archived.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Archived
          </h2>
          <SortableClassGrid
            items={archived}
            onReorder={() => {}}
            disabled
            renderItem={(cls) => (
              <ClassCard
                cls={cls}
                onCopyCode={handleCopyCode}
                onEdit={(c) => setFormState({ kind: 'edit', cls: c as TeacherClassListItem })}
                onToggleArchive={handleToggleArchive}
                onDelete={(c) => setDeleteTarget(c as TeacherClassListItem)}
              />
            )}
          />
        </div>
      )}

      <ClassFormModal
        open={formState.kind !== 'closed'}
        mode={formState.kind === 'edit' ? { kind: 'edit', cls: formState.cls } : { kind: 'create' }}
        nameSuggestions={nameSuggestions}
        sectionSuggestions={sectionSuggestions}
        onClose={() => setFormState({ kind: 'closed' })}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete class?"
        message={
          <p>
            This will permanently delete <strong>{deleteTarget?.name}</strong>{' '}
            and remove all enrollments and join requests. This action cannot be undone.
          </p>
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg">
          <Check className="h-4 w-4 text-green-400" />
          {toast}
        </div>
      )}
    </div>
  );
}