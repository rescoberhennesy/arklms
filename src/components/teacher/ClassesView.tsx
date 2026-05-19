'use client';

import { useState, useTransition, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Plus, Check, Search } from 'lucide-react';
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
import SortableClassGrid from '@/components/dashboard/SortableClassGrid';
import SortableItem from '@/components/dashboard/SortableItem';
import { cn } from '@/lib/utils/cn';

interface ClassesViewProps {
  initialClasses: TeacherClassListItem[];
  nameSuggestions: string[];
  sectionSuggestions: string[];
}

type FormState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; cls: TeacherClassListItem };

type FilterKey = 'all' | 'active' | 'archived';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'archived', label: 'Archived' },
];

export function ClassesView({
  initialClasses,
  nameSuggestions,
  sectionSuggestions,
}: ClassesViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [classes, setClasses] = useState(initialClasses);
  const [formState, setFormState] = useState<FormState>({ kind: 'closed' });
  const [deleteTarget, setDeleteTarget] = useState<TeacherClassListItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Filter + search state
  const [filter, setFilter] = useState<FilterKey>('active');
  const [query, setQuery] = useState('');

  const hasOpenedFromParam = useRef(false);
  useEffect(() => {
    if (hasOpenedFromParam.current) return;
    if (searchParams.get('create') === '1') {
      hasOpenedFromParam.current = true;
      setFormState({ kind: 'create' });
      const params = new URLSearchParams(searchParams.toString());
      params.delete('create');
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [searchParams, pathname, router]);

  async function handleReorder(orderedIds: string[]) {
    const snapshot = classes;
    setClasses((prev) => {
      const byId = new Map(prev.map((c) => [c.id, c]));
      const reordered = orderedIds
        .map((id) => byId.get(id))
        .filter((c): c is TeacherClassListItem => Boolean(c));
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
            ? {
                ...updated,
                enrolled_count: c.enrolled_count,
                avatars: c.avatars, // preserve — edit doesn't change roster
              }
            : c,
        ),
      );
      showToast('Class updated');
    } else {
      const res = await createClass(input);
      if (!res.ok) throw new Error(res.error);
      const created = res.data;
      const newItem: TeacherClassListItem = {
        ...created,
        enrolled_count: 0,
        avatars: [],
      };
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

  // ---- Derived: filtered + searched list ----
  const activeCount = classes.filter((c) => !c.is_archived).length;
  const archivedCount = classes.filter((c) => c.is_archived).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return classes.filter((c) => {
      if (filter === 'active' && c.is_archived) return false;
      if (filter === 'archived' && !c.is_archived) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.section ?? '').toLowerCase().includes(q) ||
        (c.subject_code ?? '').toLowerCase().includes(q) ||
        c.invite_code.toLowerCase().includes(q)
      );
    });
  }, [classes, filter, query]);

  // For the All view, we still want active-first then archived. The base
  // ordering from listMyClasses already does that (is_archived asc), so
  // `filtered` preserves it. Reorder is only saved for the active-only view
  // to keep behaviour predictable — see handleReorderGuard below.
  const reorderEnabled = filter === 'active' || (filter === 'all' && archivedCount === 0);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Classes</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {activeCount} active{archivedCount > 0 && `, ${archivedCount} archived`}
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
{/* Toolbar: search + filter pills (grouped together on the left) */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search classes…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>

        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5"></div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const isActive = filter === f.key;
            const count =
              f.key === 'all'
                ? classes.length
                : f.key === 'active'
                ? activeCount
                : archivedCount;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border bg-white px-3.5 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-red-500 text-red-600 ring-1 ring-red-500'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50',
                )}
              >
                {f.label}
                <span
                  className={cn(
                    'text-xs',
                    isActive ? 'text-red-500/80' : 'text-gray-400',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Empty states */}
      {classes.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <h3 className="text-base font-medium text-gray-900">No classes yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create your first class to get started.
          </p>
        </div>
      )}

      {classes.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <h3 className="text-base font-medium text-gray-900">
            {query ? 'No classes match your search' : `No ${filter} classes`}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {query
              ? 'Try a different keyword or clear the search.'
              : 'Switch filter to see other classes.'}
          </p>
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 && (
        <SortableClassGrid
          items={filtered}
          onReorder={reorderEnabled ? handleReorder : () => {}}
          disabled={!reorderEnabled}
          renderItem={(cls) =>
            reorderEnabled ? (
              <SortableItem id={cls.id}>
                <ClassCard
                  cls={cls}
                  onCopyCode={handleCopyCode}
                  onEdit={(c) => setFormState({ kind: 'edit', cls: c as TeacherClassListItem })}
                  onToggleArchive={handleToggleArchive}
                  onDelete={(c) => setDeleteTarget(c as TeacherClassListItem)}
                />
              </SortableItem>
            ) : (
              <ClassCard
                cls={cls}
                onCopyCode={handleCopyCode}
                onEdit={(c) => setFormState({ kind: 'edit', cls: c as TeacherClassListItem })}
                onToggleArchive={handleToggleArchive}
                onDelete={(c) => setDeleteTarget(c as TeacherClassListItem)}
              />
            )
          }
        />
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