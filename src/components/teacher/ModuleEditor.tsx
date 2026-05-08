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
  Pencil,
  Trash2,
  GripVertical,
  FileText,
  Plus,
  Loader2,
  Save,
  Tag,
} from 'lucide-react';
import MarkdownEditor from '@/components/dashboard/MarkdownEditor';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import {
  type ModuleWithLessons,
  type LessonSummary,
  renameModule,
  setModuleTerm,
  updateModuleDescription,
  deleteModule,
  createLesson,
  deleteLesson,
  reorderLessons,
} from '@/lib/actions/modules';
import {
  type ModuleTerm,
  MODULE_TERMS,
  MODULE_TERM_LABELS,
} from '@/lib/types/modules';

interface ModuleEditorProps {
  module: ModuleWithLessons;
  classId: string;
}

const TERM_ACCENTS: Record<ModuleTerm, string> = {
  prelim: 'border-blue-200 text-blue-800 bg-blue-50',
  midterm: 'border-purple-200 text-purple-800 bg-purple-50',
  prefinal: 'border-amber-200 text-amber-800 bg-amber-50',
  final: 'border-rose-200 text-rose-800 bg-rose-50',
};

export default function ModuleEditor({ module, classId }: ModuleEditorProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // Title
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(module.title);

  // Description (manual save, like lesson body)
  const [description, setDescription] = useState(module.description);
  const [savedDescription, setSavedDescription] = useState(module.description);
  const [descEditing, setDescEditing] = useState(false);
  const isDescDirty = description !== savedDescription;

  // Async state
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Lessons (local optimistic copy for drag)
  const [lessons, setLessons] = useState<LessonSummary[]>(module.lessons);
  if (
    module.lessons.map((l) => l.id).join(',') !==
    lessons.map((l) => l.id).join(',')
  ) {
    setLessons(module.lessons);
  }

  function handleSaveTitle() {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === module.title) {
      setTitleDraft(module.title);
      setTitleEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        await renameModule(module.id, trimmed);
        setTitleEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save title.');
        setTitleDraft(module.title);
        setTitleEditing(false);
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
        setError(e instanceof Error ? e.message : 'Failed to change term.');
      }
    });
  }

  function handleSaveDescription() {
    setError(null);
    startTransition(async () => {
      try {
        await updateModuleDescription(module.id, description);
        setSavedDescription(description);
        setDescEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save description.');
      }
    });
  }

  function handleCancelDescription() {
    setDescription(savedDescription);
    setDescEditing(false);
  }

  async function handleDelete() {
    await deleteModule(module.id);
    router.push(`/teacher/classes/${classId}?tab=modules`);
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Title bar */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {titleEditing ? (
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle();
                if (e.key === 'Escape') {
                  setTitleDraft(module.title);
                  setTitleEditing(false);
                }
              }}
              autoFocus
              disabled={isPending}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-2xl font-bold text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
            />
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{module.title}</h1>
              <button
                type="button"
                onClick={() => setTitleEditing(true)}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Rename"
                title="Rename"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${TERM_ACCENTS[module.term]}`}
          >
            <Tag className="h-3 w-3" />
            {MODULE_TERM_LABELS[module.term]}
          </span>
          <select
            value={module.term}
            onChange={(e) => handleChangeTerm(e.target.value as ModuleTerm)}
            disabled={isPending}
            aria-label="Change term"
            title="Change term"
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {MODULE_TERMS.map((t) => (
              <option key={t} value={t}>
                {MODULE_TERM_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Description */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Description
          </h2>
          {descEditing ? (
            <div className="flex items-center gap-2 text-xs">
              {isDescDirty ? (
                <span className="text-amber-600">Unsaved changes</span>
              ) : (
                <span className="text-gray-400">No changes</span>
              )}
              <button
                type="button"
                onClick={handleCancelDescription}
                disabled={isPending}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDescription}
                disabled={isPending || !isDescDirty}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Save
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDescEditing(true)}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Edit description"
              title="Edit description"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {descEditing ? (
          <MarkdownEditor
            value={description}
            onChange={setDescription}
            placeholder="Describe what this module covers. Markdown supported."
            rows={6}
            disabled={isPending}
          />
        ) : savedDescription.trim() ? (
          <MarkdownContent body={savedDescription} />
        ) : (
          <p className="text-sm italic text-gray-400">
            No description yet. Click the pencil icon to add one.
          </p>
        )}
      </section>

      {/* Lessons */}
      <LessonsSection
        moduleId={module.id}
        classId={classId}
        lessons={lessons}
        onLessonsChanged={setLessons}
        onError={setError}
      />

      {/* Danger zone */}
      <section className="rounded-xl border border-red-200 bg-red-50/30 p-4">
        <h2 className="text-sm font-semibold text-red-900">Danger zone</h2>
        <p className="mt-1 text-xs text-red-700">
          Deleting this module is permanent and removes all its lessons and
          attachments.
        </p>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete module
        </button>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete module?"
        message={`"${module.title}" and all ${lessons.length} of its lessons (including attachments) will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

interface LessonsSectionProps {
  moduleId: string;
  classId: string;
  lessons: LessonSummary[];
  onLessonsChanged: (lessons: LessonSummary[]) => void;
  onError: (msg: string | null) => void;
}

function LessonsSection({
  moduleId,
  classId,
  lessons,
  onLessonsChanged,
  onError,
}: LessonsSectionProps) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleAddLesson() {
    onError(null);
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        const { lessonId } = await createLesson(moduleId, trimmed);
        setNewTitle('');
        setShowAdd(false);
        router.push(`/teacher/classes/${classId}/lessons/${lessonId}`);
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to add lesson.');
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = lessons.findIndex((l) => l.id === active.id);
    const newIndex = lessons.findIndex((l) => l.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(lessons, oldIndex, newIndex);
    onLessonsChanged(next);

    startTransition(async () => {
      try {
        await reorderLessons(moduleId, next.map((l) => l.id));
        router.refresh();
      } catch (e) {
        onLessonsChanged(lessons);
        onError(e instanceof Error ? e.message : 'Failed to reorder.');
      }
    });
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Lessons
        </h2>
        <span className="text-xs text-gray-400">
          {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'}
        </span>
      </div>

      {lessons.length === 0 ? (
        <p className="mb-3 text-sm italic text-gray-400">No lessons yet.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={lessons.map((l) => l.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="mb-3 space-y-1">
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

      {showAdd ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Lesson title"
            autoFocus
            disabled={isPending}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddLesson();
              if (e.key === 'Escape') {
                setNewTitle('');
                setShowAdd(false);
              }
            }}
            className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleAddLesson}
            disabled={isPending || !newTitle.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setNewTitle('');
              setShowAdd(false);
            }}
            disabled={isPending}
            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900"
        >
          <Plus className="h-4 w-4" />
          Add lesson
        </button>
      )}
    </section>
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
      className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50/50 px-2 py-2 hover:bg-gray-100/60"
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        className="cursor-grab rounded p-0.5 text-gray-300 hover:bg-gray-200 hover:text-gray-500 active:cursor-grabbing"
        aria-label="Drag to reorder lesson"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <FileText className="h-4 w-4 shrink-0 text-gray-400" />

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