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
  Users,
  AlertCircle,
  Copy,
  CopyPlus,
  MoreHorizontal,
  ExternalLink,
  ClipboardList,
  ListChecks,
} from 'lucide-react';
import {
  reorderActivities,
  deleteActivity,
  duplicateActivity,
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
import CopyFromClassModal from '@/components/teacher/CopyFromClassModal';
import { useServerSyncedState } from '@/lib/hooks/useServerSyncedState';

export interface ActivitiesTabRosterEntry {
  student_id: string;
  full_name: string | null;
  email: string | null;
}

type CompletionFilter = 'all' | 'has_ungraded' | 'fully_graded' | 'drafts';

interface ActivitiesTabProps {
  classId: string;
  activities: ActivityWithAllSubmissions[];
  roster: ActivitiesTabRosterEntry[];
  initialFilter?: 'all' | 'has_ungraded' | 'fully_graded';
}

type ActivityCardStatus = 'draft' | 'scheduled' | 'open' | 'past_due' | 'closed';

function computeCardStatus(a: ActivityWithAllSubmissions, now: number): ActivityCardStatus {
  if (!a.published) return 'draft';
  const startAt = new Date(a.startAt).getTime();
  const dueAt = new Date(a.dueAt).getTime();
  if (now < startAt) return 'scheduled';
  if (now <= dueAt) return 'open';
  if (a.allowLate) return 'past_due';
  return 'closed';
}

const STATUS_PILL_CLASS: Record<ActivityCardStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-50 text-blue-700',
  open: 'bg-green-50 text-green-700',
  past_due: 'bg-amber-50 text-amber-700',
  closed: 'bg-gray-100 text-gray-600',
};

const STATUS_PILL_LABEL: Record<ActivityCardStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  open: 'Open',
  past_due: 'Past due',
  closed: 'Closed',
};

const FILTER_LABEL: Record<CompletionFilter, string> = {
  all: 'All',
  has_ungraded: 'To grade',
  fully_graded: 'Graded',
  drafts: 'Drafts',
};

const FILTER_KEYS = Object.keys(FILTER_LABEL) as CompletionFilter[];

function isCompletionFilter(v: string | null): v is CompletionFilter {
  return v !== null && (FILTER_KEYS as string[]).includes(v);
}

function isModuleTerm(v: string | null): v is ModuleTerm {
  return v !== null && (MODULE_TERMS as readonly string[]).includes(v);
}

function activitiesSignature(activities: ActivityWithAllSubmissions[]): string {
  return activities
    .map(
      (a) =>
        `${a.id}:${a.term}:${a.displayOrder}:${a.title}:${a.published ? 1 : 0}:${a.startAt}:${a.dueAt}:${a.submissions.length}`,
    )
    .join('|');
}

function activityIsFullyGraded(a: ActivityWithAllSubmissions): boolean {
  if (a.submissions.length === 0) return false;
  return a.submissions.every((s: SubmissionWithGrade) => s.grade !== null);
}

function activityHasUngraded(a: ActivityWithAllSubmissions): boolean {
  return a.submissions.some((s: SubmissionWithGrade) => s.grade === null);
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function dueHint(
  a: ActivityWithAllSubmissions,
  status: ActivityCardStatus,
  now: number,
): { text: string; className: string } | null {
  if (status === 'draft') return null;
  if (status === 'scheduled') return { text: `Opens ${formatShortDate(a.startAt)}`, className: 'text-blue-700' };
  if (status === 'past_due') return { text: 'Past due · late allowed', className: 'text-amber-700' };
  if (status === 'closed') return { text: 'Closed', className: 'text-gray-500' };
  const msLeft = new Date(a.dueAt).getTime() - now;
  const hours = Math.floor(msLeft / 3_600_000);
  if (hours < 24) {
    return {
      text: hours <= 0 ? 'Due within the hour' : `${hours} hour${hours === 1 ? '' : 's'} left`,
      className: 'font-semibold text-red-700',
    };
  }
  const days = Math.ceil(msLeft / 86_400_000);
  return {
    text: `${days} day${days === 1 ? '' : 's'} left`,
    className: days <= 7 ? 'font-semibold text-amber-700' : 'text-gray-500',
  };
}

export default function ActivitiesTab({
  classId,
  activities: initialActivities,
  roster,
  initialFilter,
}: ActivitiesTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activities, setActivities] = useServerSyncedState(initialActivities, activitiesSignature);
  const [error, setError] = useState<string | null>(null);
  const [copyModalOpen, setCopyModalOpen] = useState(false);

  // ---- Filter (URL > server hint > 'all') ----
  const filterParam = searchParams.get('completion');
  const filter: CompletionFilter = isCompletionFilter(filterParam) ? filterParam : (initialFilter ?? 'all');

  function replaceParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function setFilter(next: CompletionFilter) {
    replaceParam('completion', next);
  }

  // ---- Active term ----
  const termParam = searchParams.get('term');
  const [activeTerm, setActiveTerm] = useState<ModuleTerm>(() => {
    if (isModuleTerm(termParam)) return termParam;
    const first = MODULE_TERMS.find((t) => initialActivities.some((a) => a.term === t));
    return first ?? MODULE_TERMS[0];
  });

  function selectTerm(t: ModuleTerm) {
    setActiveTerm(t);
    replaceParam('term', t);
  }

  const termCounts = useMemo(() => {
    const m = new Map<ModuleTerm, number>();
    for (const t of MODULE_TERMS) m.set(t, 0);
    for (const a of activities) m.set(a.term, (m.get(a.term) ?? 0) + 1);
    return m;
  }, [activities]);

  const filterCounts = useMemo(() => {
    const inTerm = activities.filter((a) => a.term === activeTerm);
    let hasUngraded = 0;
    let fullyGraded = 0;
    let drafts = 0;
    for (const a of inTerm) {
      if (!a.published) {
        drafts++;
        continue;
      }
      if (activityHasUngraded(a)) hasUngraded++;
      else if (activityIsFullyGraded(a)) fullyGraded++;
    }
    return { all: inTerm.length, has_ungraded: hasUngraded, fully_graded: fullyGraded, drafts };
  }, [activities, activeTerm]);

  function passesFilter(a: ActivityWithAllSubmissions): boolean {
    if (filter === 'all') return true;
    if (filter === 'drafts') return !a.published;
    if (!a.published) return false;
    if (filter === 'has_ungraded') return activityHasUngraded(a);
    return activityIsFullyGraded(a);
  }

  // ---- ?create=1 ----
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
    setActiveTerm(newActivity.term);
  }

  function handleActivityRemoved(activityId: string) {
    setActivities((prev) => prev.filter((a) => a.id !== activityId));
  }

  function handleTermReordered(term: ModuleTerm, next: ActivityWithAllSubmissions[]) {
    setActivities((prev) => [...prev.filter((a) => a.term !== term), ...next]);
  }

  function handleCopyCompleted(newActivityId: string) {
    router.push(`/teacher/classes/${classId}/activities/${newActivityId}`);
  }

  const rosterSize = roster.length;
  const submitterIdsByActivity = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const a of activities) m.set(a.id, new Set(a.submissions.map((s) => s.studentId)));
    return m;
  }, [activities]);

  const visible = activities
    .filter((a) => a.term === activeTerm && passesFilter(a))
    .sort((x, y) => x.displayOrder - y.displayOrder);

  const termTotal = termCounts.get(activeTerm) ?? 0;
  const termLabel = MODULE_TERM_LABELS[activeTerm];

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Term tabs + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Grading period" className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          {MODULE_TERMS.map((t) => {
            const active = t === activeTerm;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTerm(t)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition ${
                  active ? 'bg-red-600 font-semibold text-white' : 'font-medium text-gray-700 hover:bg-gray-50'
                }`}
              >
                {MODULE_TERM_LABELS[t]}
                <span
                  className={`rounded-full px-1.5 text-[11px] font-semibold ${
                    active ? 'bg-white text-red-600' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {termCounts.get(t) ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCopyModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <CopyPlus className="h-4 w-4" />
            Copy from another class
          </button>
          <AddActivityBar
            classId={classId}
            onOptimisticAdd={handleOptimisticAdd}
            onError={setError}
            defaultOpen={createOpenFromParam}
            defaultTerm={activeTerm}
          />
        </div>
      </div>

      {/* One list card: filters in the header, activities as rows */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
          <div role="tablist" aria-label="Filter activities" className="flex flex-wrap gap-1">
            {FILTER_KEYS.map((key) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(key)}
                  className={`rounded-lg px-3 py-1.5 text-[13px] transition ${
                    active ? 'bg-gray-900 font-semibold text-white' : 'font-medium text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {FILTER_LABEL[key]} <span className={active ? 'text-white/70' : 'text-gray-400'}>{filterCounts[key]}</span>
                </button>
              );
            })}
          </div>
          {visible.length > 1 && (
            <span className="text-xs text-gray-400">
              {filter === 'all' ? 'Drag to reorder' : 'Switch to All to reorder'}
            </span>
          )}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            termLabel={termLabel}
            filterActive={filter !== 'all' && termTotal > 0}
            onShowAll={() => setFilter('all')}
            onCopy={() => setCopyModalOpen(true)}
          />
        ) : (
          <TermList
            term={activeTerm}
            classId={classId}
            activities={visible}
            roster={roster}
            rosterSize={rosterSize}
            submitterIdsByActivity={submitterIdsByActivity}
            canReorder={filter === 'all'}
            onReordered={(next) => handleTermReordered(activeTerm, next)}
            onActivityRemoved={handleActivityRemoved}
            onError={setError}
          />
        )}
      </section>

      <CopyFromClassModal
        open={copyModalOpen}
        targetClassId={classId}
        onClose={() => setCopyModalOpen(false)}
        onCopied={handleCopyCompleted}
      />
    </div>
  );
}

// ===========================================================================
// Empty state (inside the list card)
// ===========================================================================

function EmptyState({
  termLabel,
  filterActive,
  onShowAll,
  onCopy,
}: {
  termLabel: string;
  filterActive: boolean;
  onShowAll: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        <ClipboardList className="h-7 w-7" />
      </div>
      {filterActive ? (
        <>
          <h3 className="text-lg font-bold text-gray-900">No matching activities in {termLabel}</h3>
          <p className="max-w-md text-sm text-gray-600">Nothing in this term matches the current filter.</p>
          <button
            type="button"
            onClick={onShowAll}
            className="mt-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Show all activities
          </button>
        </>
      ) : (
        <>
          <h3 className="text-lg font-bold text-gray-900">No activities in {termLabel} yet</h3>
          <p className="max-w-md text-sm text-gray-600">
            Create an activity or quiz with the button above, or reuse ones you already made in another class.
          </p>
          <button
            type="button"
            onClick={onCopy}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <CopyPlus className="h-4 w-4" />
            Copy from another class
          </button>
        </>
      )}
    </div>
  );
}

// ===========================================================================
// Sortable rows for one term
// ===========================================================================

interface TermListProps {
  term: ModuleTerm;
  classId: string;
  activities: ActivityWithAllSubmissions[];
  roster: ActivitiesTabRosterEntry[];
  rosterSize: number;
  submitterIdsByActivity: Map<string, Set<string>>;
  canReorder: boolean;
  onReordered: (next: ActivityWithAllSubmissions[]) => void;
  onActivityRemoved: (activityId: string) => void;
  onError: (msg: string | null) => void;
}

function TermList({
  term,
  classId,
  activities,
  roster,
  rosterSize,
  submitterIdsByActivity,
  canReorder,
  onReordered,
  onActivityRemoved,
  onError,
}: TermListProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    if (!canReorder) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = activities.findIndex((a) => a.id === active.id);
    const newIndex = activities.findIndex((a) => a.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(activities, oldIndex, newIndex);
    onReordered(next);
    startTransition(async () => {
      try {
        await reorderActivities(classId, term, next.map((a) => a.id));
        router.refresh();
      } catch (e) {
        onReordered(activities);
        onError(e instanceof Error ? e.message : 'Failed to reorder.');
      }
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={activities.map((a) => a.id)} strategy={verticalListSortingStrategy}>
        <ul className="divide-y divide-gray-100">
          {activities.map((a) => (
            <ActivityRow
              key={a.id}
              activity={a}
              classId={classId}
              roster={roster}
              rosterSize={rosterSize}
              submitterIds={submitterIdsByActivity.get(a.id) ?? new Set<string>()}
              canReorder={canReorder}
              onActivityRemoved={onActivityRemoved}
              onError={onError}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

// ===========================================================================
// One activity row
// ===========================================================================

interface ActivityRowProps {
  activity: ActivityWithAllSubmissions;
  classId: string;
  roster: ActivitiesTabRosterEntry[];
  rosterSize: number;
  submitterIds: Set<string>;
  canReorder: boolean;
  onActivityRemoved: (activityId: string) => void;
  onError: (msg: string | null) => void;
}

function ActivityRow({
  activity,
  classId,
  roster,
  rosterSize,
  submitterIds,
  canReorder,
  onActivityRemoved,
  onError,
}: ActivityRowProps) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: activity.id, disabled: !canReorder });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const now = Date.now();
  const status = computeCardStatus(activity, now);
  const isDraft = status === 'draft';
  const hint = dueHint(activity, status, now);
  const isQuiz = activity.activityKind === 'quiz';

  const submissionCount = activity.submissions.length;
  const ungradedCount = activity.submissions.filter((s) => s.grade === null).length;
  const showRoster = activity.published && now >= new Date(activity.startAt).getTime() && rosterSize > 0;
  const submittedFromRoster = roster.filter((r) => submitterIds.has(r.student_id)).length;
  const missingStudents = showRoster ? roster.filter((r) => !submitterIds.has(r.student_id)) : [];
  const submittedPct = rosterSize > 0 ? Math.round((submittedFromRoster / rosterSize) * 100) : 0;
  const allGraded = submissionCount > 0 && ungradedCount === 0;

  const href = `/teacher/classes/${classId}/activities/${activity.id}`;

  async function handleDelete() {
    try {
      await deleteActivity(activity.id);
      onActivityRemoved(activity.id);
      router.refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete activity.');
    }
  }

  async function handleDuplicate() {
    if (duplicating) return;
    setMenuOpen(false);
    setDuplicating(true);
    onError(null);
    try {
      const { activityId: newId } = await duplicateActivity({
        sourceActivityId: activity.id,
        targetClassId: classId,
        targetTerm: activity.term,
      });
      router.refresh();
      router.push(`/teacher/classes/${classId}/activities/${newId}`);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to duplicate activity.');
      setDuplicating(false);
    }
  }

  const primary =
    ungradedCount > 0
      ? { label: 'Grade now', className: 'bg-red-600 text-white hover:bg-red-700' }
      : { label: isDraft ? 'Edit' : 'Open', className: 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50' };

  return (
    <li ref={setNodeRef} style={style} className={isDraft ? 'bg-gray-50/70' : 'bg-white'}>
      <div className="flex flex-wrap items-center gap-4 px-4 py-4">
        {canReorder && (
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            type="button"
            className="-ml-1 cursor-grab rounded p-0.5 text-gray-300 hover:bg-gray-100 hover:text-gray-500 active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        <div
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isDraft ? 'bg-gray-100 text-gray-500' : isQuiz ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          {isQuiz ? <ListChecks className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}
        </div>

        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={href}
              className={`truncate text-[15px] font-semibold hover:text-red-600 ${isDraft ? 'text-gray-700' : 'text-gray-900'}`}
            >
              {activity.title}
            </Link>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL_CLASS[status]}`}>
              {STATUS_PILL_LABEL[status]}
            </span>
          </div>
          <p className="mt-0.5 text-[13px] text-gray-500">
            {isQuiz ? 'Quiz' : 'Activity'} · Due {formatShortDate(activity.dueAt)}
            {hint && (
              <>
                {' · '}
                <span className={hint.className}>{hint.text}</span>
              </>
            )}
            {' · '}
            {activity.maxPoints} pts
          </p>
        </div>

        <div className="w-full sm:w-44">
          {isDraft ? (
            <p className="text-xs text-gray-500">Not published yet</p>
          ) : showRoster ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-gray-600">
                  <b className="text-gray-900">{submittedFromRoster}</b> of {rosterSize} submitted
                </span>
                {ungradedCount > 0 ? (
                  <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {ungradedCount} to grade
                  </span>
                ) : allGraded ? (
                  <span className="font-semibold text-green-700">✓</span>
                ) : null}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${allGraded && submittedFromRoster === rosterSize ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: `${submittedPct}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">{rosterSize === 0 ? 'No students yet' : 'Not open yet'}</p>
          )}
        </div>

        <div className="relative flex items-center gap-2" ref={menuRef}>
          <Link href={href} className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${primary.className}`}>
            {primary.label}
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-800"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <Link href={href} role="menuitem" className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <ExternalLink className="h-4 w-4 text-gray-400" />
                Open
              </Link>
              {showRoster && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExpanded((v) => !v);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Users className="h-4 w-4 text-gray-400" />
                  {expanded ? 'Hide missing students' : 'Show missing students'}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={handleDuplicate}
                disabled={duplicating}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Copy className="h-4 w-4 text-gray-400" />
                {duplicating ? 'Duplicating…' : 'Duplicate in this class'}
              </button>
              <div className="my-1 border-t border-gray-100" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDelete(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {expanded && showRoster && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3">
          {missingStudents.length === 0 ? (
            <p className="text-xs text-green-700">✓ Everyone submitted. Nice.</p>
          ) : (
            <>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-700">
                <AlertCircle className="h-3.5 w-3.5" />
                {missingStudents.length} student{missingStudents.length === 1 ? '' : 's'} have not submitted
              </div>
              <ul className="space-y-0.5">
                {missingStudents.map((s) => (
                  <li key={s.student_id} className="flex items-center justify-between gap-3 text-xs text-gray-700">
                    <span className="font-medium text-gray-900">{s.full_name ?? 'Unknown'}</span>
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