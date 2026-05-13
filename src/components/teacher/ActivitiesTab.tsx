
'use client';

import { useState, useTransition, useEffect, useRef, useMemo } from 'react';
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
  Trash2,
  GripVertical,
  Calendar,
  Award,
  Tag,
  ChevronDown,
  ChevronRight,
  Users,
  AlertCircle,
} from 'lucide-react';
import {
  reorderActivities,
  deleteActivity,
} from '@/lib/actions/activities';
import {
  type ActivityWithAllSubmissions,
  type SubmissionWithGrade,
} from '@/lib/types/activities';
import {
  type ModuleTerm,
  MODULE_TERMS,
  MODULE_TERM_LABELS,
} from '@/lib/types/modules';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import AddActivityBar from '@/components/teacher/AddActivityBar';
import { useServerSyncedState } from '@/lib/hooks/useServerSyncedState';

// Mirror of the listClassRoster return-row shape. Defined inline (rather than
// imported) because enrollments.ts doesn't export a named type for it; this
// keeps the contract explicit at the boundary.
export interface ActivitiesTabRosterEntry {
  student_id: string;
  full_name: string | null;
  email: string | null;
}

interface ActivitiesTabProps {
  classId: string;
  activities: ActivityWithAllSubmissions[];
  roster: ActivitiesTabRosterEntry[];
}

type ActivityCardStatus =
  | 'draft'
  | 'scheduled'
  | 'open'
  | 'past_due'
  | 'closed';

function computeCardStatus(
  a: ActivityWithAllSubmissions,
  now: number,
): ActivityCardStatus {
  if (!a.published) return 'draft';
  const startAt = new Date(a.startAt).getTime();
  const dueAt = new Date(a.dueAt).getTime();
  if (now < startAt) return 'scheduled';
  if (now <= dueAt) return 'open';
  if (a.allowLate) return 'past_due';
  return 'closed';
}

const STATUS_PILL_CLASS: Record<ActivityCardStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-800',
  open: 'bg-green-100 text-green-800',
  past_due: 'bg-amber-100 text-amber-800',
  closed: 'bg-gray-200 text-gray-600',
};

const STATUS_PILL_LABEL: Record<ActivityCardStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  open: 'Open',
  past_due: 'Past due (late ok)',
  closed: 'Closed',
};

const TERM_ACCENTS: Record<ModuleTerm, string> = {
  prelim: 'border-blue-200 bg-blue-50',
  midterm: 'border-purple-200 bg-purple-50',
  prefinal: 'border-amber-200 bg-amber-50',
  final: 'border-rose-200 bg-rose-50',
};

const TERM_TEXT_ACCENTS: Record<ModuleTerm, string> = {
  prelim: 'text-blue-800',
  midterm: 'text-purple-800',
  prefinal: 'text-amber-800',
  final: 'text-rose-800',
};

// Completion-tracking filter buckets (Session 13).
type CompletionFilter = 'all' | 'has_ungraded' | 'fully_graded';

const FILTER_LABEL: Record<CompletionFilter, string> = {
  all: 'All',
  has_ungraded: 'Has ungraded',
  fully_graded: 'Fully graded',
};

function activitiesSignature(activities: ActivityWithAllSubmissions[]): string {
  return activities
    .map(
      (a) =>
        `${a.id}:${a.term}:${a.displayOrder}:${a.title}:${a.published ? 1 : 0}:${a.startAt}:${a.dueAt}:${a.submissions.length}`,
    )
    .join('|');
}

// "Fully graded" means: every existing submission has a grade. Activities
// with zero submissions are vacuously fully graded; we exclude them from
// this bucket because the filter intent is "I'm done grading this" not
// "no one has submitted yet."
function activityIsFullyGraded(a: ActivityWithAllSubmissions): boolean {
  if (a.submissions.length === 0) return false;
  return a.submissions.every((s: SubmissionWithGrade) => s.grade !== null);
}

function activityHasUngraded(a: ActivityWithAllSubmissions): boolean {
  return a.submissions.some((s: SubmissionWithGrade) => s.grade === null);
}

export default function ActivitiesTab({
  classId,
  activities: initialActivities,
  roster,
}: ActivitiesTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Server-synced local state: optimistic mutations preserved between
  // server pushes; full resync when the parent re-fetches and the
  // signature changes.
  const [activities, setActivities] = useServerSyncedState(
    initialActivities,
    activitiesSignature,
  );

  const [error, setError] = useState<string | null>(null);

  // URL-driven completion filter (Session 13). Survives refresh.
  const filterParam = searchParams.get('completion');
  const filter: CompletionFilter =
    filterParam === 'has_ungraded' || filterParam === 'fully_graded'
      ? filterParam
      : 'all';

  function setFilter(next: CompletionFilter) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') {
      params.delete('completion');
    } else {
      params.set('completion', next);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Counts for filter pill badges — based on the published activities only.
  // Drafts never count toward grading-state buckets (no one's submitting yet).
  const filterCounts = useMemo(() => {
    let hasUngraded = 0;
    let fullyGraded = 0;
    for (const a of activities) {
      if (!a.published) continue;
      if (activityHasUngraded(a)) hasUngraded++;
      else if (activityIsFullyGraded(a)) fullyGraded++;
    }
    return {
      all: activities.length,
      has_ungraded: hasUngraded,
      fully_graded: fullyGraded,
    };
  }, [activities]);

  // Apply filter. Drafts are kept under "All" and hidden under the grading
  // buckets (since there's nothing to grade yet).
  function passesFilter(a: ActivityWithAllSubmissions): boolean {
    if (filter === 'all') return true;
    if (!a.published) return false;
    if (filter === 'has_ungraded') return activityHasUngraded(a);
    return activityIsFullyGraded(a);
  }

  // Dashboard quick-action deep-link support: when arriving with
  // ?tab=activities&create=1 (the picker route at /teacher/quick/activity
  // produces this), open the AddActivityBar in its expanded form. We
  // snapshot the param once at mount and immediately strip it from the URL
  // so a refresh / close / reopen flow doesn't re-trigger.
  const [createOpenFromParam, setCreateOpenFromParam] = useState(false);
  const hasConsumedCreateParam = useRef(false);
  useEffect(() => {
    if (hasConsumedCreateParam.current) return;
    if (searchParams.get('create') === '1') {
      hasConsumedCreateParam.current = true;
      setCreateOpenFromParam(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete('create');
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [searchParams, pathname, router]);

  function handleOptimisticAdd(newActivity: ActivityWithAllSubmissions) {
    setActivities((prev) => [...prev, newActivity]);
  }

  function handleActivityRemoved(activityId: string) {
    setActivities((prev) => prev.filter((a) => a.id !== activityId));
  }

  function handleTermReordered(
    term: ModuleTerm,
    nextActivities: ActivityWithAllSubmissions[],
  ) {
    setActivities((prev) => {
      const otherTerms = prev.filter((a) => a.term !== term);
      return [...otherTerms, ...nextActivities];
    });
  }

  const rosterSize = roster.length;
  const submitterIdsByActivity = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const a of activities) {
      m.set(a.id, new Set(a.submissions.map((s) => s.studentId)));
    }
    return m;
  }, [activities]);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <AddActivityBar
        classId={classId}
        onOptimisticAdd={handleOptimisticAdd}
        onError={setError}
        defaultOpen={createOpenFromParam}
      />

      {/* Completion filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(FILTER_LABEL) as CompletionFilter[]).map((key) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                active
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50'
              }`}
            >
              {FILTER_LABEL[key]}
              <span
                className={`rounded-full px-1.5 text-[10px] font-semibold ${
                  active
                    ? 'bg-white/25 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {filterCounts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {MODULE_TERMS.map((term) => {
        const inTerm = activities
          .filter((a) => a.term === term && passesFilter(a))
          .sort((x, y) => x.displayOrder - y.displayOrder);
        return (
          <TermSection
            key={term}
            term={term}
            classId={classId}
            activities={inTerm}
            roster={roster}
            rosterSize={rosterSize}
            submitterIdsByActivity={submitterIdsByActivity}
            filterActive={filter !== 'all'}
            onReordered={(next) => handleTermReordered(term, next)}
            onActivityRemoved={handleActivityRemoved}
            onError={setError}
          />
        );
      })}
    </div>
  );
}

interface TermSectionProps {
  term: ModuleTerm;
  classId: string;
  activities: ActivityWithAllSubmissions[];
  roster: ActivitiesTabRosterEntry[];
  rosterSize: number;
  submitterIdsByActivity: Map<string, Set<string>>;
  filterActive: boolean;
  onReordered: (next: ActivityWithAllSubmissions[]) => void;
  onActivityRemoved: (activityId: string) => void;
  onError: (msg: string | null) => void;
}

function TermSection({
  term,
  classId,
  activities,
  roster,
  rosterSize,
  submitterIdsByActivity,
  filterActive,
  onReordered,
  onActivityRemoved,
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

    const oldIndex = activities.findIndex((a) => a.id === active.id);
    const newIndex = activities.findIndex((a) => a.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(activities, oldIndex, newIndex);
    onReordered(next);

    startTransition(async () => {
      try {
        await reorderActivities(
          classId,
          term,
          next.map((a) => a.id),
        );
        router.refresh();
      } catch (e) {
        onReordered(activities);
        onError(e instanceof Error ? e.message : 'Failed to reorder.');
      }
    });
  }

  // Empty-state messaging differs depending on whether the filter is hiding
  // things or the term genuinely has nothing in it.
  const emptyMsg = filterActive
    ? 'No activities in this term match the current filter.'
    : 'No activities in this term yet.';

  return (
    <section
      className={`rounded-xl border ${TERM_ACCENTS[term]} p-4 shadow-sm`}
    >
      <div className="mb-3 flex items-center gap-2">
        <Tag className={`h-4 w-4 ${TERM_TEXT_ACCENTS[term]}`} />
        <h2
          className={`text-sm font-semibold uppercase tracking-wide ${TERM_TEXT_ACCENTS[term]}`}
        >
          {MODULE_TERM_LABELS[term]}
        </h2>
        <span className="text-xs text-gray-500">
          {activities.length}{' '}
          {activities.length === 1 ? 'activity' : 'activities'}
        </span>
      </div>

      {activities.length === 0 ? (
        <p className="text-sm italic text-gray-400">{emptyMsg}</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={activities.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {activities.map((a) => (
                <ActivityCard
                  key={a.id}
                  activity={a}
                  classId={classId}
                  roster={roster}
                  rosterSize={rosterSize}
                  submitterIds={
                    submitterIdsByActivity.get(a.id) ?? new Set<string>()
                  }
                  onActivityRemoved={onActivityRemoved}
                  onError={onError}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

interface ActivityCardProps {
  activity: ActivityWithAllSubmissions;
  classId: string;
  roster: ActivitiesTabRosterEntry[];
  rosterSize: number;
  submitterIds: Set<string>;
  onActivityRemoved: (activityId: string) => void;
  onError: (msg: string | null) => void;
}

function ActivityCard({
  activity,
  classId,
  roster,
  rosterSize,
  submitterIds,
  onActivityRemoved,
  onError,
}: ActivityCardProps) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activity.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const cardStatus = computeCardStatus(activity, Date.now());
  const submissionCount = activity.submissions.length;
  const gradedCount = activity.submissions.filter(
    (s: SubmissionWithGrade) => s.grade,
  ).length;

  // Roster-aware "X of N" completeness — only meaningful for published,
  // started activities. For drafts and not-yet-started, fall back to the
  // older raw-counts display.
  const startAtMs = new Date(activity.startAt).getTime();
  const showRosterCompleteness =
    activity.published && Date.now() >= startAtMs && rosterSize > 0;

  const submittedFromRoster = roster.filter((r) =>
    submitterIds.has(r.student_id),
  ).length;
  const missingStudents = showRosterCompleteness
    ? roster.filter((r) => !submitterIds.has(r.student_id))
    : [];

  async function handleDelete() {
    try {
      await deleteActivity(activity.id);
      onActivityRemoved(activity.id);
      router.refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete activity.');
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-md border border-gray-200 bg-white shadow-sm hover:bg-gray-50/60"
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab rounded p-0.5 text-gray-300 hover:bg-gray-200 hover:text-gray-500 active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <Link
            href={`/teacher/classes/${classId}/activities/${activity.id}`}
            className="block truncate text-sm font-medium text-gray-900 hover:text-red-600"
          >
            {activity.title}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Due {new Date(activity.dueAt).toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-1">
              <Award className="h-3 w-3" />
              {activity.maxPoints} pts
            </span>
            {showRosterCompleteness ? (
              <span
                className={`inline-flex items-center gap-1 font-medium ${
                  submittedFromRoster === rosterSize
                    ? 'text-green-700'
                    : 'text-gray-700'
                }`}
              >
                <Users className="h-3 w-3" />
                {submittedFromRoster} of {rosterSize} submitted
                {gradedCount > 0 && (
                  <span className="font-normal text-gray-500">
                    {' '}
                    · {gradedCount} graded
                  </span>
                )}
              </span>
            ) : (
              submissionCount > 0 && (
                <span>
                  {submissionCount} submission
                  {submissionCount === 1 ? '' : 's'}, {gradedCount} graded
                </span>
              )
            )}
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL_CLASS[cardStatus]}`}
        >
          {STATUS_PILL_LABEL[cardStatus]}
        </span>

        {showRosterCompleteness && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label={
              expanded ? 'Hide missing students' : 'Show missing students'
            }
            aria-expanded={expanded}
            title={
              expanded ? 'Hide missing students' : 'Show missing students'
            }
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
          aria-label="Delete activity"
          title="Delete activity"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Inline missing-students expand */}
      {expanded && showRosterCompleteness && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-3 py-2.5">
          {missingStudents.length === 0 ? (
            <p className="text-xs text-green-700">
              ✓ Everyone submitted. Nice.
            </p>
          ) : (
            <>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-700">
                <AlertCircle className="h-3.5 w-3.5" />
                {missingStudents.length} student
                {missingStudents.length === 1 ? '' : 's'} have not submitted
              </div>
              <ul className="space-y-0.5">
                {missingStudents.map((s) => (
                  <li
                    key={s.student_id}
                    className="flex items-center justify-between gap-3 text-xs text-gray-700"
                  >
                    <span className="font-medium text-gray-900">
                      {s.full_name ?? 'Unknown'}
                    </span>
                    <span className="text-gray-500">{s.email ?? '—'}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete activity?"
        message={`"${activity.title}" and all ${submissionCount} submission${submissionCount === 1 ? '' : 's'} (and any attachments) will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </li>
  );
}
