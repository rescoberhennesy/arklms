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
  CopyPlus,
  Copy,
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

const STATUS_LABEL: Record<ActivityCardStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  open: 'Open',
  past_due: 'Past due',
  closed: 'Closed',
};

const STATUS_PILL: Record<ActivityCardStatus, string> = {
  draft: 'bg-zinc-100 text-zinc-600',
  scheduled: 'bg-blue-50 text-blue-700',
  open: 'bg-emerald-50 text-emerald-700',
  past_due: 'bg-amber-50 text-amber-700',
  closed: 'bg-zinc-100 text-zinc-600',
};

const FILTER_LABEL: Record<CompletionFilter, string> = {
  all: 'All',
  has_ungraded: 'To grade',
  fully_graded: 'Graded',
  drafts: 'Drafts',
};

const FILTER_KEYS = Object.keys(FILTER_LABEL) as CompletionFilter[];

// Shared column layout for the header row and every activity row (md and up).
const ROW_GRID =
  'md:grid md:grid-cols-[minmax(0,1fr)_140px_110px_130px_96px] md:items-center md:gap-4';

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

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Second line under the due date. Grey by default; red only when < 24h left. */
function dueHint(
  a: ActivityWithAllSubmissions,
  status: ActivityCardStatus,
  now: number,
): { text: string; urgent: boolean } {
  if (status === 'draft') return { text: formatTime(a.dueAt), urgent: false };
  if (status === 'scheduled') return { text: `Opens ${formatShortDate(a.startAt)}`, urgent: false };
  if (status === 'past_due') return { text: 'Past due · late allowed', urgent: false };
  if (status === 'closed') return { text: 'Closed', urgent: false };
  const msLeft = new Date(a.dueAt).getTime() - now;
  const hours = Math.floor(msLeft / 3_600_000);
  if (hours < 24) {
    return {
      text: hours <= 0 ? 'Due within the hour' : `${hours} hour${hours === 1 ? '' : 's'} left`,
      urgent: true,
    };
  }
  const days = Math.ceil(msLeft / 86_400_000);
  return { text: `${days} day${days === 1 ? '' : 's'} left`, urgent: false };
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
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {/* Term switcher + actions (same style as the Modules tab) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Grading period"
          className="inline-flex flex-wrap gap-1 rounded-2xl bg-zinc-100 p-1"
        >
          {MODULE_TERMS.map((t) => {
            const active = t === activeTerm;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTerm(t)}
                className={`inline-flex min-h-10 items-center rounded-xl px-5 text-sm transition ${
                  active
                    ? 'bg-white font-bold text-red-700 shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                    : 'font-semibold text-zinc-500 hover:text-zinc-900'
                }`}
              >
                {MODULE_TERM_LABELS[t]}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCopyModalOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
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

      {/* Filters + table in one card */}
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]">
        <div
          role="tablist"
          aria-label="Filter activities"
          className="flex flex-wrap gap-1 border-b border-zinc-100 px-5 py-3"
        >
          {FILTER_KEYS.map((key) => {
            const active = filter === key;
            const count = filterCounts[key];
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-[13px] transition ${
                  active ? 'bg-zinc-900 font-semibold text-white' : 'font-medium text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                {FILTER_LABEL[key]}{' '}
                <span
                  className={
                    active
                      ? 'text-white/60'
                      : key === 'has_ungraded' && count > 0
                        ? 'font-semibold text-red-600'
                        : 'text-zinc-400'
                  }
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            termLabel={termLabel}
            filterActive={filter !== 'all' && termTotal > 0}
            onShowAll={() => setFilter('all')}
            onCopy={() => setCopyModalOpen(true)}
          />
        ) : (
          <>
            <div className={`hidden border-b border-zinc-100 bg-zinc-50/60 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 ${ROW_GRID}`}>
              <span className="pl-12">Title</span>
              <span>Due</span>
              <span>Submitted</span>
              <span>Status</span>
              <span className="sr-only">Actions</span>
            </div>
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
          </>
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
// Empty state
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
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      {filterActive ? (
        <>
          <h3 className="text-base font-semibold text-zinc-900">No matching activities in {termLabel}</h3>
          <p className="max-w-md text-sm text-zinc-500">Nothing in this term matches the current filter.</p>
          <button
            type="button"
            onClick={onShowAll}
            className="mt-2 text-sm font-semibold text-zinc-900 underline-offset-4 hover:underline"
          >
            Show all activities
          </button>
        </>
      ) : (
        <>
          <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <ClipboardList className="h-6 w-6" />
          </span>
          <h3 className="text-base font-bold text-zinc-900">No {termLabel} activities yet</h3>
          <p className="max-w-md text-sm text-zinc-500">
            Create an activity or quiz with the button above, or reuse ones you already made in another class.
          </p>
          <button
            type="button"
            onClick={onCopy}
            className="mt-2 text-sm font-semibold text-zinc-900 underline-offset-4 hover:underline"
          >
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
        <ul className="divide-y divide-zinc-100">
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
  const hint = dueHint(activity, status, now);
  const isQuiz = activity.activityKind === 'quiz';

  const submissionCount = activity.submissions.length;
  const ungradedCount = activity.submissions.filter((s) => s.grade === null).length;
  const showRoster = activity.published && now >= new Date(activity.startAt).getTime() && rosterSize > 0;
  const submittedFromRoster = roster.filter((r) => submitterIds.has(r.student_id)).length;
  const submittedPct = rosterSize > 0 ? Math.round((submittedFromRoster / rosterSize) * 100) : 0;
  const missingStudents = showRoster ? roster.filter((r) => !submitterIds.has(r.student_id)) : [];
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

  // Status pill: red only when something needs grading.
  let pill: { text: string; className: string };
  if (ungradedCount > 0) {
    pill = { text: `${ungradedCount} to grade`, className: 'bg-red-50 text-red-700' };
  } else if (allGraded) {
    pill = { text: 'Graded', className: 'bg-emerald-50 text-emerald-700' };
  } else {
    pill = { text: STATUS_LABEL[status], className: STATUS_PILL[status] };
  }

  return (
    <li ref={setNodeRef} style={style} className="group">
      <div className={`relative flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition hover:bg-zinc-50/70 ${ROW_GRID}`}>
        {/* Title (icon + text) */}
        <div className="relative flex min-w-0 flex-1 basis-full items-center gap-3 md:basis-auto">
          {canReorder && (
            <button
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              type="button"
              className="absolute -left-5 top-1/2 z-10 -translate-y-1/2 cursor-grab rounded p-0.5 text-zinc-300 opacity-0 transition hover:text-zinc-500 focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              isQuiz ? 'bg-purple-50 text-purple-600' : 'bg-red-50 text-red-600'
            }`}
          >
            {isQuiz ? <ListChecks className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            {/* Stretched link: clicking anywhere on the row opens the activity */}
            <Link
              href={href}
              className="block truncate text-[15px] font-bold text-zinc-900 after:absolute after:inset-0 after:content-[''] hover:text-red-600"
            >
              {activity.title}
            </Link>
            <p className="mt-0.5 text-[13px] text-zinc-500">
              {isQuiz ? 'Quiz' : 'Activity'} · {activity.maxPoints} pts
            </p>
          </div>
        </div>

        {/* Due */}
        <div className="text-sm">
          <p className="font-medium text-zinc-800">{formatDay(activity.dueAt)}</p>
          <p className={`text-xs ${hint.urgent ? 'font-semibold text-red-600' : 'text-zinc-500'}`}>{hint.text}</p>
        </div>

        {/* Submitted */}
        <div className="text-sm text-zinc-800">
          {showRoster ? (
            <>
              <p className="font-medium">
                {submittedFromRoster} <span className="font-normal text-zinc-400">/ {rosterSize}</span>
              </p>
              <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-red-500" style={{ width: `${submittedPct}%` }} />
              </div>
            </>
          ) : (
            <span className="text-zinc-400">—</span>
          )}
        </div>

        {/* Status */}
        <div>
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${pill.className}`}>
            {pill.text}
          </span>
        </div>

        {/* Actions */}
        <div className="relative z-10 ml-auto flex items-center justify-end gap-1" ref={menuRef}>
          {ungradedCount > 0 && (
            <Link
              href={href}
              className="rounded-md px-2 py-1.5 text-[13px] font-bold text-red-600 transition hover:bg-red-50"
            >
              Grade
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-800"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-xl"
            >
              <Link
                href={href}
                role="menuitem"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                <ExternalLink className="h-4 w-4 text-zinc-400" />
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
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  <Users className="h-4 w-4 text-zinc-400" />
                  {expanded ? 'Hide missing students' : 'Show missing students'}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={handleDuplicate}
                disabled={duplicating}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                <Copy className="h-4 w-4 text-zinc-400" />
                {duplicating ? 'Duplicating…' : 'Duplicate in this class'}
              </button>
              <div className="my-1 border-t border-zinc-100" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDelete(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {expanded && showRoster && (
        <div className="border-t border-zinc-100 bg-zinc-50/50 px-5 py-3 md:pl-[4.25rem]">
          {missingStudents.length === 0 ? (
            <p className="text-xs text-zinc-500">Everyone submitted.</p>
          ) : (
            <>
              <p className="mb-1.5 text-xs font-semibold text-zinc-700">
                {missingStudents.length} student{missingStudents.length === 1 ? '' : 's'} have not submitted
              </p>
              <ul className="space-y-0.5">
                {missingStudents.map((s) => (
                  <li key={s.student_id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-zinc-900">{s.full_name ?? 'Unknown'}</span>
                    <span className="text-zinc-400">{s.email ?? '—'}</span>
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