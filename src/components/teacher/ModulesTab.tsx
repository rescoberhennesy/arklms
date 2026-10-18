'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Plus,
  ChevronDown,
  ChevronRight,
  Trash2,
  FileText,
  Loader2,
  CopyPlus,
  MoreHorizontal,
  FolderOpen,
  Pencil,
  ArrowRightLeft,
  ExternalLink,
  EyeOff,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import {
  type ModuleWithLessons,
  type LessonSummary,
  createModule,
  renameModule,
  setModuleTerm,
  deleteModule,
  reorderModules,
  createLesson,
  deleteLesson,
  reorderLessons,
} from '@/lib/actions/modules';
import {
  type ModuleTerm,
  MODULE_TERMS,
  MODULE_TERM_LABELS,
} from '@/lib/types/modules';
import { useServerSyncedState } from '@/lib/hooks/useServerSyncedState';
import Modal from '@/components/shared/Modal';
import CopyModulesModal from '@/components/teacher/CopyModulesModal';

interface ModulesTabProps {
  classId: string;
  initialModules: ModuleWithLessons[];
}

function modulesSignature(modules: ModuleWithLessons[]): string {
  return modules
    .map(
      (m) =>
        `${m.id}:${m.term}:${m.display_order}:${m.title}:${m.description}:${m.lessons.map((l) => `${l.id}:${l.display_order}:${l.title}:${l.published}`).join('|')}`,
    )
    .join(',');
}

function modulesForTerm(modules: ModuleWithLessons[], term: ModuleTerm) {
  return modules
    .filter((m) => m.term === term)
    .sort((a, b) => a.display_order - b.display_order);
}

// Open on the first grading period that has modules (Prelim if none do).
function firstTermWithModules(modules: ModuleWithLessons[]): ModuleTerm {
  return MODULE_TERMS.find((t) => modules.some((m) => m.term === t)) ?? 'prelim';
}

export default function ModulesTab({ classId, initialModules }: ModulesTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [modules, setModules] = useServerSyncedState(
    initialModules,
    modulesSignature,
  );
  const [activeTerm, setActiveTerm] = useState<ModuleTerm>(() =>
    firstTermWithModules(initialModules),
  );
  const [addOpen, setAddOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dashboard quick-action deep link: ?tab=modules&create=1 opens the
  // "new module" form on mount, then strips the param.
  const hasConsumedCreateParam = useRef(false);
  useEffect(() => {
    if (hasConsumedCreateParam.current) return;
    if (searchParams.get('create') === '1') {
      hasConsumedCreateParam.current = true;
      setAddOpen(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete('create');
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [searchParams, pathname, router]);

  const termModules = modulesForTerm(modules, activeTerm);
  const termLabel = MODULE_TERM_LABELS[activeTerm];

  function replaceTermModules(term: ModuleTerm, next: ModuleWithLessons[]) {
    setModules((prev) => [...prev.filter((m) => m.term !== term), ...next]);
  }

  return (
    <div className="space-y-6">
      {/* Grading-period tabs + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Grading period"
          className="inline-flex flex-wrap gap-1 rounded-2xl bg-zinc-100 p-1"
        >
            {MODULE_TERMS.map((term) => {
            const active = term === activeTerm;
            return (
              <button
                key={term}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setActiveTerm(term);
                  setAddOpen(false);
                  setError(null);
                }}
                className={`inline-flex min-h-10 items-center rounded-xl px-5 text-sm transition ${
                  active
                    ? 'bg-white font-bold text-red-700 shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                    : 'font-semibold text-zinc-500 hover:text-zinc-900'
                }`}
              >
                {MODULE_TERM_LABELS[term]}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCopyOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            <CopyPlus className="h-4 w-4" />
            Copy from another class
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-bold text-white shadow-[0_6px_16px_rgba(220,38,38,0.22)] transition hover:bg-red-700 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} />
            Add module to {termLabel}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <CopyModulesModal
        open={copyOpen}
        targetClassId={classId}
        onClose={() => setCopyOpen(false)}
      />
      {addOpen && (
        <AddModuleForm
          open={addOpen}
          classId={classId}
          term={activeTerm}
          onCancel={() => setAddOpen(false)}
          onAdded={(newModule) => {
            setModules((prev) => [...prev, newModule]);
            setAddOpen(false);
          }}
        />
      )}

      {termModules.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <FolderOpen className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-zinc-900">
            No {termLabel} modules yet
          </h3>
          <p className="max-w-md text-sm text-zinc-600">
            Modules group your lessons by week or topic. Students only see
            lessons you publish.
          </p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-600 bg-white px-4 text-sm font-bold text-red-700 transition hover:bg-red-50"
          >
            <Plus className="h-4 w-4" />
            Add the first {termLabel} module
          </button>
        </div>
      ) : (
        <ModuleList
          classId={classId}
          term={activeTerm}
          modules={termModules}
          onModulesChanged={(next) => replaceTermModules(activeTerm, next)}
          onMoved={(moduleId, nextTerm) =>
            setModules((prev) =>
              prev.map((m) =>
                m.id === moduleId
                  ? { ...m, term: nextTerm, display_order: Number.MAX_SAFE_INTEGER }
                  : m,
              ),
            )
          }
          onRenamed={(moduleId, title) =>
            setModules((prev) =>
              prev.map((m) => (m.id === moduleId ? { ...m, title } : m)),
            )
          }
          onError={setError}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New module form (term = the tab you're on)
// ---------------------------------------------------------------------------

interface AddModuleFormProps {
  open: boolean;
  classId: string;
  term: ModuleTerm;
  onCancel: () => void;
  onAdded: (module: ModuleWithLessons) => void;
}

function AddModuleForm({ open, classId, term, onCancel, onAdded }: AddModuleFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Start fresh every time the modal opens
  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setFormError(null);
    }
  }, [open]);

  function handleClose() {
    if (isPending) return;
    onCancel();
  }

  function handleAdd() {
    setFormError(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setFormError('Title is required.');
      return;
    }
    const trimmedDesc = description.trim();

    startTransition(async () => {
      try {
        const { moduleId } = await createModule(classId, trimmed, term, trimmedDesc);
        onAdded({
          id: moduleId,
          class_id: classId,
          title: trimmed,
          description: trimmedDesc,
          term,
          display_order: Number.MAX_SAFE_INTEGER,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_hidden: false,
          lessons: [],
        });
        router.refresh();
      } catch (e) {
        setFormError(e instanceof Error ? e.message : 'Failed to add module.');
      }
    });
  }

  return (
    <Modal
      open={open}
      title={`New ${MODULE_TERM_LABELS[term]} module`}
      onClose={handleClose}
      busy={isPending}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAdd();
        }}
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="new-module-title" className="mb-1 block text-xs font-semibold text-zinc-700">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="new-module-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Week 1 – Introduction to Business Finance"
              autoFocus
              disabled={isPending}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10 disabled:opacity-60"
            />
          </div>
          <div>
            <label htmlFor="new-module-description" className="mb-1 block text-xs font-semibold text-zinc-700">
              Description <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <textarea
              id="new-module-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief overview of what this module covers."
              rows={3}
              disabled={isPending}
              className="w-full resize-y rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10 disabled:opacity-60"
            />
          </div>
        </div>

        {formError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2 border-t border-zinc-100 pt-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || !title.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Add module
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Module list for one term (drag to reorder) — drawn as a numbered path
// ---------------------------------------------------------------------------

interface ModuleListProps {
  classId: string;
  term: ModuleTerm;
  modules: ModuleWithLessons[];
  onModulesChanged: (modules: ModuleWithLessons[]) => void;
  onMoved: (moduleId: string, term: ModuleTerm) => void;
  onRenamed: (moduleId: string, title: string) => void;
  onError: (msg: string | null) => void;
}

function ModuleList({
  classId,
  term,
  modules,
  onModulesChanged,
  onMoved,
  onRenamed,
  onError,
}: ModuleListProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = modules.findIndex((m) => m.id === active.id);
    const newIndex = modules.findIndex((m) => m.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(modules, oldIndex, newIndex);
    onModulesChanged(next);
    startTransition(async () => {
      try {
        await reorderModules(classId, term, next.map((m) => m.id));
        router.refresh();
      } catch (e) {
        onModulesChanged(modules);
        onError(e instanceof Error ? e.message : 'Failed to reorder.');
      }
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={modules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
        <div className="relative space-y-4">
          {/* The path line connecting the numbered markers */}
          {modules.length > 1 && (
            <div
              aria-hidden="true"
              className="absolute bottom-8 left-[23px] top-8 w-0.5 bg-zinc-200"
            />
          )}
          {modules.map((module, index) => (
            <ModuleCard
              key={module.id}
              module={module}
              index={index}
              classId={classId}
              onLessonsChanged={(lessons) =>
                onModulesChanged(
                  modules.map((m) => (m.id === module.id ? { ...m, lessons } : m)),
                )
              }
              onMoved={onMoved}
              onRenamed={onRenamed}
              onError={onError}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// One module card (numbered marker + card)
// ---------------------------------------------------------------------------

interface ModuleCardProps {
  module: ModuleWithLessons;
  index: number;
  classId: string;
  onLessonsChanged: (lessons: LessonSummary[]) => void;
  onMoved: (moduleId: string, term: ModuleTerm) => void;
  onRenamed: (moduleId: string, title: string) => void;
  onError: (msg: string | null) => void;
}

function ModuleCard({
  module,
  index,
  classId,
  onLessonsChanged,
  onMoved,
  onRenamed,
  onError,
}: ModuleCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(module.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  const lessons = module.lessons;
  const publishedCount = lessons.filter((l) => l.published).length;
  const draftCount = lessons.length - publishedCount;
  
  const isHidden = Boolean(module.is_hidden);

  const summary =
    lessons.length === 0
      ? 'No lessons yet'
      : `${lessons.length} ${lessons.length === 1 ? 'lesson' : 'lessons'} · ${publishedCount} published${
          draftCount > 0 ? ` · ${draftCount} draft` : ''
        }`;

  const lessonSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: module.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Close the ⋯ menu when clicking anywhere else.
  useEffect(() => {
    if (!menuOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setMoveOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    setMoveOpen(false);
  }

  function handleMove(nextTerm: ModuleTerm) {
    closeMenu();
    if (nextTerm === module.term) return;
    onMoved(module.id, nextTerm);
    startTransition(async () => {
      try {
        await setModuleTerm(module.id, nextTerm);
        router.refresh();
      } catch (e) {
        onMoved(module.id, module.term);
        onError(e instanceof Error ? e.message : 'Failed to move module.');
      }
    });
  }

  function handleRenameSave() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === module.title) {
      setRenaming(false);
      setRenameValue(module.title);
      return;
    }
    onRenamed(module.id, trimmed);
    setRenaming(false);
    startTransition(async () => {
      try {
        await renameModule(module.id, trimmed);
        router.refresh();
      } catch (e) {
        onRenamed(module.id, module.title);
        onError(e instanceof Error ? e.message : 'Failed to rename module.');
      }
    });
  }

  async function handleDelete() {
    await deleteModule(module.id);
    router.refresh();
  }

  function handleLessonDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = lessons.findIndex((l) => l.id === active.id);
    const newIndex = lessons.findIndex((l) => l.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(lessons, oldIndex, newIndex);
    onLessonsChanged(next);
    startTransition(async () => {
      try {
        await reorderLessons(module.id, next.map((l) => l.id));
        router.refresh();
      } catch {
        onLessonsChanged(lessons);
      }
    });
  }

  const otherTerms = MODULE_TERMS.filter((t) => t !== module.term);

    const markerClass = isHidden
    ? 'border-2 border-dashed border-zinc-300 bg-white text-zinc-400'
    : expanded
      ? 'border border-red-200 bg-red-50 text-red-700'
      : 'border border-zinc-200 bg-white text-zinc-600';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative flex items-start gap-3 sm:gap-4"
    >
      {/* Numbered marker on the path */}
      <span
        aria-hidden="true"
        className={`relative z-[1] flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[15px] font-extrabold shadow-[0_0_0_6px_#faf8f7] ${markerClass}`}
      >
        {String(index + 1).padStart(2, '0')}
      </span>

      <article
        className={`min-w-0 flex-1 overflow-visible rounded-2xl border ${
          isHidden
            ? 'border-dashed border-zinc-300 bg-zinc-50'
            : 'border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]'
        }`}
      >
        <header className="flex flex-wrap items-center gap-3 px-3 py-3 sm:px-4">
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            type="button"
            className="-mr-1 cursor-grab rounded p-1 text-zinc-300 opacity-0 transition hover:bg-zinc-100 hover:text-zinc-600 focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
            aria-label="Drag to reorder module"
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-900"
            aria-label={expanded ? 'Collapse module' : 'Expand module'}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          <div className="min-w-0 flex-1 basis-[220px]">
            {renaming ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRenameSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSave();
                  if (e.key === 'Escape') {
                    setRenaming(false);
                    setRenameValue(module.title);
                  }
                }}
                autoFocus
                aria-label="Module title"
                className="w-full rounded-lg border border-red-300 px-2 py-1.5 text-base font-bold text-zinc-900 focus:outline-none focus:ring-4 focus:ring-red-500/10"
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/teacher/classes/${classId}/modules/${module.id}`}
                  className={`min-w-0 truncate text-base font-extrabold hover:text-red-600 ${
                    isHidden ? 'text-zinc-500' : 'text-zinc-900'
                  }`}
                >
                  {module.title}
                </Link>
                {isHidden && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2.5 py-0.5 text-[11.5px] font-bold text-zinc-600">
                    <EyeOff className="h-3 w-3" />
                    Hidden from students
                  </span>
                )}
              </div>
            )}
            <p className="mt-0.5 text-[12.5px] text-zinc-500">{summary}</p>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => {
                setMenuOpen((v) => !v);
                setMoveOpen(false);
              }}
              disabled={isPending}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-800 disabled:opacity-50"
              aria-label="Module options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-5 w-5" />}
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-11 z-20 w-56 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl"
              >
                <Link
                  role="menuitem"
                  href={`/teacher/classes/${classId}/modules/${module.id}`}
                  className="flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-sm text-zinc-800 hover:bg-zinc-100"
                >
                  <ExternalLink className="h-4 w-4 text-zinc-500" />
                  Open module
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    setRenameValue(module.title);
                    setRenaming(true);
                  }}
                  className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-zinc-800 hover:bg-zinc-100"
                >
                  <Pencil className="h-4 w-4 text-zinc-500" />
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setMoveOpen((v) => !v)}
                  aria-expanded={moveOpen}
                  className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-zinc-800 hover:bg-zinc-100"
                >
                  <ArrowRightLeft className="h-4 w-4 text-zinc-500" />
                  Move to another period
                  <ChevronRight className={`ml-auto h-4 w-4 text-zinc-400 transition ${moveOpen ? 'rotate-90' : ''}`} />
                </button>
                {moveOpen && (
                  <div className="mb-1 ml-7 flex flex-col">
                    {otherTerms.map((t) => (
                      <button
                        key={t}
                        type="button"
                        role="menuitem"
                        onClick={() => handleMove(t)}
                        className="min-h-8 rounded-lg px-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                      >
                        {MODULE_TERM_LABELS[t]}
                      </button>
                    ))}
                  </div>
                )}
                <div className="my-1 h-px bg-zinc-100" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    setConfirmDelete(true);
                  }}
                  className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete module
                </button>
              </div>
            )}
          </div>
        </header>

        {expanded && (
          <div className="border-t border-zinc-100 px-2.5 pb-3 pt-2 sm:px-3">
            {lessons.length === 0 ? (
              <p className="px-2 py-2 text-sm text-zinc-500">No lessons in this module yet.</p>
            ) : (
              <DndContext
                sensors={lessonSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleLessonDragEnd}
              >
                <SortableContext items={lessons.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-1">
                      {lessons.map((lesson) => (
                      <LessonRow key={lesson.id} lesson={lesson} classId={classId} />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}

            <AddLessonInline moduleId={module.id} classId={classId} onError={onError} />
          </div>
        )}
      </article>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete module?"
        message={`This will delete "${module.title}" and all ${lessons.length} of its lessons (including any attachments). This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// "+ Add lesson" — creates a draft lesson and opens it in the editor
// ---------------------------------------------------------------------------

function AddLessonInline({
  moduleId,
  classId,
  onError,
}: {
  moduleId: string;
  classId: string;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onError(null);
    startTransition(async () => {
      try {
        const { lessonId } = await createLesson(moduleId, trimmed);
        router.push(`/teacher/classes/${classId}/lessons/${lessonId}`);
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to add lesson.');
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 text-sm font-bold text-red-700 transition hover:border-red-300 hover:bg-red-50"
      >
        <Plus className="h-4 w-4" strokeWidth={2.4} />
        Add lesson
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Lesson title, e.g. Lesson 2 – Forms of Business Ownership"
        autoFocus
        disabled={isPending}
        aria-label="New lesson title"
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCreate();
          if (e.key === 'Escape') {
            setOpen(false);
            setTitle('');
          }
        }}
        className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-500/10 disabled:opacity-60"
      />
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setTitle('');
        }}
        disabled={isPending}
        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleCreate}
        disabled={isPending || !title.trim()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Create & edit
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One lesson row (whole row clicks through to the lesson)
// ---------------------------------------------------------------------------

function LessonRow({
  lesson,
  classId,
}: {
  lesson: LessonSummary;
  classId: string;
}) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  async function handleDelete() {
    await deleteLesson(lesson.id);
    router.refresh();
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="group/lesson relative flex min-h-14 items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-zinc-50"
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        className="relative z-10 cursor-grab rounded p-0.5 text-zinc-300 opacity-0 transition hover:text-zinc-500 focus-visible:opacity-100 group-hover/lesson:opacity-100 active:cursor-grabbing"
        aria-label="Drag to reorder lesson"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          lesson.published ? 'bg-red-50 text-red-600' : 'bg-zinc-100 text-zinc-500'
        }`}
      >
        <FileText className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        {/* Stretched link: the whole row opens the lesson */}
        <Link
          href={`/teacher/classes/${classId}/lessons/${lesson.id}`}
          className="block truncate text-sm font-bold text-zinc-900 after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:text-red-600"
        >
          {lesson.title}
        </Link>
         {!lesson.published && (
          <p className="truncate text-xs text-zinc-500">Not visible to students yet</p>
        )}
      </div>

      {lesson.published ? (
        <span className="shrink-0 rounded-full bg-green-50 px-2.5 py-0.5 text-[11.5px] font-bold text-green-700">
          Published
        </span>
      ) : (
        <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11.5px] font-bold text-zinc-600">
          Draft
        </span>
      )}

      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        className="relative z-10 rounded-lg p-1.5 text-zinc-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover/lesson:opacity-100"
        aria-label="Delete lesson"
        title="Delete lesson"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" aria-hidden="true" />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete lesson?"
        message={`This will delete "${lesson.title}" and all its attachments. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </li>
  );
}