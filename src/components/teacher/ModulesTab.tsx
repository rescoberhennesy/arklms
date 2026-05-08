'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
  Tag,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import {
  type ModuleWithLessons,
  type LessonSummary,
  createModule,
  setModuleTerm,
  deleteModule,
  reorderModules,
  deleteLesson,
  reorderLessons,
} from '@/lib/actions/modules';
import {
  type ModuleTerm,
  MODULE_TERMS,
  MODULE_TERM_LABELS,
} from '@/lib/types/modules';

interface ModulesTabProps {
  classId: string;
  initialModules: ModuleWithLessons[];
}

const TERM_ACCENTS: Record<ModuleTerm, string> = {
  prelim: 'border-blue-200 text-blue-800 bg-blue-50',
  midterm: 'border-purple-200 text-purple-800 bg-purple-50',
  prefinal: 'border-amber-200 text-amber-800 bg-amber-50',
  final: 'border-rose-200 text-rose-800 bg-rose-50',
};

function groupByTerm(
  modules: ModuleWithLessons[],
): Record<ModuleTerm, ModuleWithLessons[]> {
  const groups: Record<ModuleTerm, ModuleWithLessons[]> = {
    prelim: [],
    midterm: [],
    prefinal: [],
    final: [],
  };
  for (const m of modules) groups[m.term].push(m);
  for (const t of MODULE_TERMS) {
    groups[t].sort((a, b) => a.display_order - b.display_order);
  }
  return groups;
}

// Stable signature used to detect when the server prop diverges from local
// state (i.e. revalidation brought new data we should sync to).
function modulesSignature(modules: ModuleWithLessons[]): string {
  return modules
    .map(
      (m) =>
        `${m.id}:${m.term}:${m.display_order}:${m.title}:${m.description}:${m.lessons.map((l) => `${l.id}:${l.display_order}:${l.title}:${l.published}`).join('|')}`,
    )
    .join(',');
}

export default function ModulesTab({ classId, initialModules }: ModulesTabProps) {
  const [modules, setModules] = useState<ModuleWithLessons[]>(initialModules);
  const [error, setError] = useState<string | null>(null);

  // Sync local state when server props change (after revalidation/refresh).
  // Skip sync if the signatures already match, which means our optimistic
  // local state is already consistent with the server.
  const lastPropSig = useRef(modulesSignature(initialModules));
  useEffect(() => {
    const propSig = modulesSignature(initialModules);
    if (propSig !== lastPropSig.current) {
      lastPropSig.current = propSig;
      setModules(initialModules);
    }
  }, [initialModules]);

  const grouped = groupByTerm(modules);

  return (
    <div className="space-y-6">
      <AddModuleBar
        classId={classId}
        onError={setError}
        onOptimisticAdd={(newModule) =>
          setModules((prev) => [...prev, newModule])
        }
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {modules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-gray-700">No modules yet</p>
          <p className="mt-1 text-xs text-gray-500">
            Click &quot;Add module&quot; above to create your first one.
          </p>
        </div>
      ) : (
        MODULE_TERMS.map((term) => (
          <TermSection
            key={term}
            classId={classId}
            term={term}
            modules={grouped[term]}
            onModulesChanged={(termModules) => {
              setModules((prev) => {
                const others = prev.filter((m) => m.term !== term);
                return [...others, ...termModules];
              });
            }}
            onError={setError}
          />
        ))
      )}
    </div>
  );
}

interface AddModuleBarProps {
  classId: string;
  onError: (msg: string | null) => void;
  onOptimisticAdd: (module: ModuleWithLessons) => void;
}

function AddModuleBar({ classId, onError, onOptimisticAdd }: AddModuleBarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [term, setTerm] = useState<ModuleTerm>('prelim');
  const [isPending, startTransition] = useTransition();

  function reset() {
    setTitle('');
    setDescription('');
    setTerm('prelim');
    setOpen(false);
  }

  function handleAdd() {
    onError(null);
    const trimmed = title.trim();
    if (!trimmed) return;

    const trimmedDesc = description.trim();
    const chosenTerm = term;

    startTransition(async () => {
      try {
        const { moduleId } = await createModule(
          classId,
          trimmed,
          chosenTerm,
          trimmedDesc,
        );
        // Optimistic insert: place the new module at the END of its term
        // bucket. Server-side, createModule sets display_order to max+1,
        // so this is the correct position. We use a high temporary
        // display_order to ensure it sorts last; the next prop sync will
        // replace it with the canonical row.
        const optimistic: ModuleWithLessons = {
          id: moduleId,
          class_id: classId,
          title: trimmed,
          description: trimmedDesc,
          term: chosenTerm,
          display_order: Number.MAX_SAFE_INTEGER,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          lessons: [],
        };
        onOptimisticAdd(optimistic);
        reset();
        router.refresh();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to add module.');
      }
    });
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700"
        >
          <Plus className="h-4 w-4" />
          Add module
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">New module</h3>
      <div className="space-y-3">
        <div>
          <label
            htmlFor="new-module-title"
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            Title
          </label>
          <input
            id="new-module-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Week 1 — Introduction to Algebra"
            autoFocus
            disabled={isPending}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd();
              if (e.key === 'Escape') reset();
            }}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          />
        </div>
        <div>
          <label
            htmlFor="new-module-term"
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            Term
          </label>
          <select
            id="new-module-term"
            value={term}
            onChange={(e) => setTerm(e.target.value as ModuleTerm)}
            disabled={isPending}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          >
            {MODULE_TERMS.map((t) => (
              <option key={t} value={t}>
                {MODULE_TERM_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="new-module-description"
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            Description{' '}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            id="new-module-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief overview of what this module covers. Markdown supported."
            rows={3}
            disabled={isPending}
            className="w-full resize-y rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={isPending}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending || !title.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Add module
        </button>
      </div>
    </div>
  );
}

interface TermSectionProps {
  classId: string;
  term: ModuleTerm;
  modules: ModuleWithLessons[];
  onModulesChanged: (modules: ModuleWithLessons[]) => void;
  onError: (msg: string | null) => void;
}

function TermSection({
  classId,
  term,
  modules,
  onModulesChanged,
  onError,
}: TermSectionProps) {
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
    <section>
      <header className="mb-3 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${TERM_ACCENTS[term]}`}
        >
          <Tag className="h-3 w-3" />
          {MODULE_TERM_LABELS[term]}
        </span>
        <span className="text-xs text-gray-400">
          {modules.length} {modules.length === 1 ? 'module' : 'modules'}
        </span>
      </header>

      {modules.length === 0 ? (
        <p className="px-3 text-xs italic text-gray-400">
          No modules in {MODULE_TERM_LABELS[term]} yet.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={modules.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {modules.map((module) => (
                <ModuleCard
                  key={module.id}
                  module={module}
                  classId={classId}
                  onLessonsReordered={(lessons) => {
                    onModulesChanged(
                      modules.map((m) =>
                        m.id === module.id ? { ...m, lessons } : m,
                      ),
                    );
                  }}
                  onError={onError}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

interface ModuleCardProps {
  module: ModuleWithLessons;
  classId: string;
  onLessonsReordered: (lessons: LessonSummary[]) => void;
  onError: (msg: string | null) => void;
}

function ModuleCard({ module, classId, onLessonsReordered, onError }: ModuleCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Lessons render directly from props now (parent owns canonical state).
  // Drag updates flow up via onLessonsReordered, which mutates parent state.
  const lessons = module.lessons;

  const sensors = useSensors(
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

  function handleChangeTerm(nextTerm: ModuleTerm) {
    if (nextTerm === module.term) return;
    startTransition(async () => {
      try {
        await setModuleTerm(module.id, nextTerm);
        router.refresh();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to change term.');
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
    onLessonsReordered(next); // optimistic up to parent

    startTransition(async () => {
      try {
        await reorderLessons(module.id, next.map((l) => l.id));
        router.refresh();
      } catch {
        onLessonsReordered(lessons); // rollback
      }
    });
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-gray-200 bg-white shadow-sm"
    >
      <header className="flex items-center gap-2 px-3 py-2">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing"
          aria-label="Drag to reorder module"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <Link
          href={`/teacher/classes/${classId}/modules/${module.id}`}
          className="flex-1 truncate text-sm font-semibold text-gray-900 hover:text-red-600"
        >
          {module.title}
        </Link>

        <span className="text-xs text-gray-400">
          {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'}
        </span>

        <select
          value={module.term}
          onChange={(e) => handleChangeTerm(e.target.value as ModuleTerm)}
          disabled={isPending}
          aria-label="Change term"
          title="Change term"
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {MODULE_TERMS.map((t) => (
            <option key={t} value={t}>
              {MODULE_TERM_LABELS[t]}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={isPending}
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          aria-label="Delete"
          title="Delete module"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-3 py-2">
          {lessons.length === 0 ? (
            <p className="px-1 py-2 text-xs italic text-gray-500">
              No lessons yet.{' '}
              <Link
                href={`/teacher/classes/${classId}/modules/${module.id}`}
                className="text-red-600 underline-offset-2 hover:underline"
              >
                Open module
              </Link>{' '}
              to add lessons.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleLessonDragEnd}
            >
              <SortableContext
                items={lessons.map((l) => l.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-1">
                  {lessons.map((lesson) => (
                    <LessonRow
                      key={lesson.id}
                      lesson={lesson}
                      classId={classId}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
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

interface LessonRowProps {
  lesson: LessonSummary;
  classId: string;
}

function LessonRow({ lesson, classId }: LessonRowProps) {
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
      className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 hover:bg-gray-50"
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        className="cursor-grab rounded p-0.5 text-gray-300 hover:bg-gray-100 hover:text-gray-500 active:cursor-grabbing"
        aria-label="Drag to reorder lesson"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />

      <Link
        href={`/teacher/classes/${classId}/lessons/${lesson.id}`}
        className="flex-1 truncate text-sm text-gray-800 hover:text-red-600"
      >
        {lesson.title}
      </Link>

      {lesson.published ? (
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
          Published
        </span>
      ) : (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          Draft
        </span>
      )}

      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
        aria-label="Delete lesson"
        title="Delete lesson"
      >
        <Trash2 className="h-3.5 w-3.5" />
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