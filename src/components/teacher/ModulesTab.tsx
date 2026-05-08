'use client';

import { useState, useTransition } from 'react';
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
  Pencil,
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

interface ModulesTabProps {
  classId: string;
  initialModules: ModuleWithLessons[];
}

function groupByTerm(modules: ModuleWithLessons[]): Record<ModuleTerm, ModuleWithLessons[]> {
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

export default function ModulesTab({ classId, initialModules }: ModulesTabProps) {
  const [modules, setModules] = useState<ModuleWithLessons[]>(initialModules);
  const [error, setError] = useState<string | null>(null);

  const grouped = groupByTerm(modules);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {modules.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-gray-700">No modules yet</p>
          <p className="mt-1 text-xs text-gray-500">
            Add a module under any term below to get started.
          </p>
        </div>
      )}

      {MODULE_TERMS.map((term) => (
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
      ))}
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

const TERM_ACCENTS: Record<ModuleTerm, string> = {
  prelim: 'border-blue-200 text-blue-800 bg-blue-50',
  midterm: 'border-purple-200 text-purple-800 bg-purple-50',
  prefinal: 'border-amber-200 text-amber-800 bg-amber-50',
  final: 'border-rose-200 text-rose-800 bg-rose-50',
};

function TermSection({
  classId,
  term,
  modules,
  onModulesChanged,
  onError,
}: TermSectionProps) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleAdd() {
    onError(null);
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        await createModule(classId, trimmed, term);
        setNewTitle('');
        setShowAdd(false);
        router.refresh();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to add module.');
      }
    });
  }

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

      {modules.length > 0 && (
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

      <div className="mt-3">
        {showAdd ? (
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={`Module title (under ${MODULE_TERM_LABELS[term]})`}
              autoFocus
              disabled={isPending}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') {
                  setNewTitle('');
                  setShowAdd(false);
                }
              }}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setNewTitle('');
                  setShowAdd(false);
                }}
                disabled={isPending}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={isPending || !newTitle.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                Add module
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900"
          >
            <Plus className="h-4 w-4" />
            Add module to {MODULE_TERM_LABELS[term]}
          </button>
        )}
      </div>
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
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(module.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [isPending, startTransition] = useTransition();
  const [lessons, setLessons] = useState<LessonSummary[]>(module.lessons);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  if (module.lessons.map((l) => l.id).join(',') !==
      lessons.map((l) => l.id).join(',')) {
    setLessons(module.lessons);
  }

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

  function handleRename() {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === module.title) {
      setTitleDraft(module.title);
      setRenaming(false);
      return;
    }
    startTransition(async () => {
      try {
        await renameModule(module.id, trimmed);
        setRenaming(false);
        router.refresh();
      } catch {
        setTitleDraft(module.title);
        setRenaming(false);
      }
    });
  }

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

  function handleAddLesson() {
    const trimmed = newLessonTitle.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        const { lessonId } = await createLesson(module.id, trimmed);
        setNewLessonTitle('');
        setShowAddLesson(false);
        router.push(`/teacher/classes/${classId}/lessons/${lessonId}`);
      } catch {
        // ignore
      }
    });
  }

  function handleLessonDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = lessons.findIndex((l) => l.id === active.id);
    const newIndex = lessons.findIndex((l) => l.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(lessons, oldIndex, newIndex);
    setLessons(next);
    onLessonsReordered(next);

    startTransition(async () => {
      try {
        await reorderLessons(module.id, next.map((l) => l.id));
        router.refresh();
      } catch {
        setLessons(lessons);
        onLessonsReordered(lessons);
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

        {renaming ? (
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') {
                setTitleDraft(module.title);
                setRenaming(false);
              }
            }}
            autoFocus
            disabled={isPending}
            className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm font-semibold focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          />
        ) : (
          <h3 className="flex-1 text-sm font-semibold text-gray-900">
            {module.title}
          </h3>
        )}

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
          onClick={() => setRenaming(true)}
          disabled={isPending || renaming}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          aria-label="Rename"
          title="Rename"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
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
          {lessons.length > 0 && (
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

          {showAddLesson ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={newLessonTitle}
                onChange={(e) => setNewLessonTitle(e.target.value)}
                placeholder="Lesson title"
                autoFocus
                disabled={isPending}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddLesson();
                  if (e.key === 'Escape') {
                    setNewLessonTitle('');
                    setShowAddLesson(false);
                  }
                }}
                className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleAddLesson}
                disabled={isPending || !newLessonTitle.trim()}
                className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewLessonTitle('');
                  setShowAddLesson(false);
                }}
                disabled={isPending}
                className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddLesson(true)}
              className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            >
              <Plus className="h-3.5 w-3.5" />
              Add lesson
            </button>
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