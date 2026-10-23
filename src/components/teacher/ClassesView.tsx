'use client';

import { useState, useTransition, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Plus, Check, Search, BookOpen, SearchX } from 'lucide-react';
import { ClassCard } from './ClassCard';
import { ClassFormModal } from './ClassFormModal';
import IncomingTransfers from '@/components/teacher/IncomingTransfers';
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

const GRID_CLASS = 'grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3';

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

  // Reorder is only saved for the active-only view (or All with nothing archived)
  // to keep behaviour predictable.
  const reorderEnabled = filter === 'active' || (filter === 'all' && archivedCount === 0);

  const subtitle =
    `${activeCount} active ${activeCount === 1 ? 'class' : 'classes'}` +
    (archivedCount > 0 ? ` · ${archivedCount} archived` : '');

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight text-stone-900">
            My classes
          </h1>
          <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setFormState({ kind: 'create' })}
          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-[0_6px_16px_rgba(220,38,38,0.22)] transition-all hover:bg-red-700 active:scale-[0.98]"
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.4} />
          Create class
        </button>
      </div>

            <IncomingTransfers />

      {/* Toolbar: search (left) + segmented filter (right) */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-stone-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, section, or code"
            aria-label="Search classes"
            className="h-11 w-full rounded-xl border border-stone-200 bg-white pl-10 pr-3 text-sm text-stone-900 placeholder:text-stone-400 transition-shadow focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10"
          />
        </div>

        <div
          role="tablist"
          aria-label="Filter classes"
          className="inline-flex w-fit items-center gap-1 rounded-xl bg-stone-100 p-1"
        >
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
                role="tab"
                aria-selected={isActive}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-[9px] px-3.5 py-2 text-[13px] transition-all',
                  isActive
                    ? 'bg-white font-bold text-red-700 shadow-[0_1px_3px_rgba(28,25,23,0.08)]'
                    : 'font-semibold text-stone-600 hover:text-stone-900',
                )}
              >
                {f.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[11px] font-semibold',
                    isActive ? 'bg-red-50 text-red-700' : 'text-stone-400',
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
        <EmptyState
          icon={<BookOpen className="h-6 w-6" />}
          title="No classes yet"
          message="Use Create class above to set up your first class."
        />
      )}

      {classes.length > 0 && filtered.length === 0 && (
        <EmptyState
          icon={<SearchX className="h-6 w-6" />}
          title={query ? 'No classes match your search' : `No ${filter} classes`}
          message={
            query
              ? 'Try a different keyword or clear the search.'
              : 'Switch the filter to see other classes.'
          }
        />
      )}

      {/* Grid */}
      {filtered.length > 0 && (
        <SortableClassGrid
          items={filtered}
          className={GRID_CLASS}
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
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white shadow-xl"
        >
          <Check className="h-4 w-4 text-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  message,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        {icon}
      </span>
      <h3 className="text-base font-bold text-stone-900">{title}</h3>
      <p className="mt-1 text-sm text-stone-500">{message}</p>
    </div>
  );
}