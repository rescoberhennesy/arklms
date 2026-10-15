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
  MoreHorizontal,
  FolderOpen,
  Pencil,
  ArrowRightLeft,
  ExternalLink,
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
    <div className="space-y-5">
      {/* Grading-period tabs + add button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Grading period"
          className="inline-flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1"
        >
          {MODULE_TERMS.map((term) => {
            const active = term === activeTerm;
            const count = modules.filter((m) => m.term === term).length;
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
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm transition ${
                  active
                    ? 'bg-red-600 font-semibold text-white'
                    : 'font-medium text-gray-700 hover:bg-gray-100'
                }`}
              >
                {MODULE_TERM_LABELS[term]}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    active ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {!addOpen && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
          >
            <Plus className="h-4 w-4" />
            Add module to {termLabel}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {addOpen && (
        <AddModuleForm
          classId={classId}
          term={activeTerm}
          onError={setError}
          onCancel={() => setAddOpen(false)}
          onAdded={(newModule) => {
            setModules((prev) => [...prev, newModule]);
            setAddOpen(false);
          }}
        />
      )}

      {termModules.length === 0 ? (
        !addOpen && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <FolderOpen className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">
              No {termLabel} modules yet
            </h3>
            <p className="max-w-md text-sm text-gray-600">
              Modules group your lessons by week or topic. Students only see
              lessons you publish.
            </p>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-600 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50"
            >
              <Plus className="h-4 w-4" />
              Add the first {termLabel} module
            </button>
          </div>
        )
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
  classId: string;
  term: ModuleTerm;
  onError: (msg: string | null) => void;
  onCancel: () => void;
  onAdded: (module: ModuleWithLessons) => void;
}

function AddModuleForm({ classId, term, onError, onCancel, onAdded }: AddModuleFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    onError(null);
    const trimmed = title.trim();
    if (!trimmed) return;
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
        onError(e instanceof Error ? e.message : 'Failed to add module.');
      }
    });
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">
        New {MODULE_TERM_LABELS[term]} module
      </h3>
      <div className="space-y-3">
        <div>
          <label htmlFor="new-module-title" className="mb-1 block text-xs font-medium text-gray-700">
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
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') onCancel();
            }}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          />
        </div>
        <div>
          <label htmlFor="new-module-description" className="mb-1 block text-xs font-medium text-gray-700">
            Description <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            id="new-module-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief overview of what this module covers."
            rows={2}
            disabled={isPending}
            className="w-full resize-y rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending || !title.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Add module
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module list for one term (drag to reorder)
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
        <div className="space-y-3">
          {modules.map((module) => (
            <ModuleCard
              key={module.id}
              module={module}
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
// One module card
// ---------------------------------------------------------------------------

interface ModuleCardProps {
  module: ModuleWithLessons;
  classId: string;
  onLessonsChanged: (lessons: LessonSummary[]) => void;
  onMoved: (moduleId: string, term: ModuleTerm) => void;
  onRenamed: (moduleId: string, title: string) => void;
  onError: (msg: string | null) => void;
}

function ModuleCard({
  module,
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
  const summary =
    lessons.length === 0
      ? 'No lessons'
      : `${lessons.length} ${lessons.length === 1 ? 'lesson' : 'lessons'} · ${publishedCount} published`;

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

  return (
    <article
      ref={setNodeRef}
      style={style}
      className="group rounded-2xl border border-gray-200 bg-white shadow-sm"
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab rounded p-1 text-gray-300 opacity-0 transition hover:bg-gray-100 hover:text-gray-600 focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
          aria-label="Drag to reorder module"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label={expanded ? 'Collapse module' : 'Expand module'}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </button>

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
            className="min-w-0 flex-1 rounded-md border border-red-300 px-2 py-1.5 text-base font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        ) : (
          <Link
            href={`/teacher/classes/${classId}/modules/${module.id}`}
            className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900 hover:text-red-600"
          >
            {module.title}
          </Link>
        )}

        <span className="hidden whitespace-nowrap text-sm text-gray-500 sm:inline">{summary}</span>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => {
              setMenuOpen((v) => !v);
              setMoveOpen(false);
            }}
            disabled={isPending}
            className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            aria-label="Module options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-5 w-5" />}
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-11 z-20 w-56 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg"
            >
              <Link
                role="menuitem"
                href={`/teacher/classes/${classId}/modules/${module.id}`}
                className="flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-sm text-gray-800 hover:bg-gray-100"
              >
                <ExternalLink className="h-4 w-4 text-gray-500" />
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
                className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-gray-800 hover:bg-gray-100"
              >
                <Pencil className="h-4 w-4 text-gray-500" />
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setMoveOpen((v) => !v)}
                aria-expanded={moveOpen}
                className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-gray-800 hover:bg-gray-100"
              >
                <ArrowRightLeft className="h-4 w-4 text-gray-500" />
                Move to another period
                <ChevronRight className={`ml-auto h-4 w-4 text-gray-400 transition ${moveOpen ? 'rotate-90' : ''}`} />
              </button>
              {moveOpen && (
                <div className="mb-1 ml-7 flex flex-col">
                  {otherTerms.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="menuitem"
                      onClick={() => handleMove(t)}
                      className="min-h-8 rounded-lg px-2.5 text-left text-sm text-gray-700 hover:bg-gray-100"
                    >
                      {MODULE_TERM_LABELS[t]}
                    </button>
                  ))}
                </div>
              )}
              <div className="my-1 h-px bg-gray-100" />
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
        <div className="border-t border-gray-100 px-3 pb-3 pt-2 sm:pl-14">
          {lessons.length === 0 ? (
            <p className="px-2 py-2 text-sm text-gray-500">No lessons in this module yet.</p>
          ) : (
            <DndContext
              sensors={lessonSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleLessonDragEnd}
            >
              <SortableContext items={lessons.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-0.5">
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

      <ConfirmDialog
        open={confirmDelete}
        title="Delete module?"
        message={`This will delete "${module.title}" and all ${lessons.length} of its lessons (including any attachments). This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </article>
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
        className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
      >
        <Plus className="h-4 w-4" />
        Add lesson
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
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
        className="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
      />
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setTitle('');
        }}
        disabled={isPending}
        className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleCreate}
        disabled={isPending || !title.trim()}
        className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Create & edit
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One lesson row
// ---------------------------------------------------------------------------

function LessonRow({ lesson, classId }: { lesson: LessonSummary; classId: string }) {
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
      className="group/lesson flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-gray-50"
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        className="cursor-grab rounded p-0.5 text-gray-300 opacity-0 transition hover:text-gray-500 focus-visible:opacity-100 group-hover/lesson:opacity-100 active:cursor-grabbing"
        aria-label="Drag to reorder lesson"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <FileText className="h-4 w-4 shrink-0 text-gray-400" />

      <Link
        href={`/teacher/classes/${classId}/lessons/${lesson.id}`}
        className="min-w-0 flex-1 truncate text-sm text-gray-800 hover:text-red-600"
      >
        {lesson.title}
      </Link>

      {lesson.published ? (
        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
          Published
        </span>
      ) : (
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
          Draft
        </span>
      )}

      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        className="rounded p-1.5 text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover/lesson:opacity-100"
        aria-label="Delete lesson"
        title="Delete lesson"
      >
        <Trash2 className="h-4 w-4" />
      </button>

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