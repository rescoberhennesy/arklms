'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { type ActivityWithStudentState, type ActivityStatus } from '@/lib/types/activities';
import { type ModuleTerm, MODULE_TERMS, MODULE_TERM_LABELS } from '@/lib/types/modules';
import { cn } from '@/lib/utils/cn';

interface StudentActivitiesTabProps {
  classId: string;
  activities: ActivityWithStudentState[];
}

const ROW_GRID = 'md:grid md:grid-cols-[minmax(0,1fr)_150px_80px_130px_112px] md:items-center md:gap-4';

const NEUTRAL = 'bg-zinc-100 text-zinc-700';
const STATUS_PILL: Record<ActivityStatus, { className: string; dot: string; label: string }> = {
  not_started: { className: NEUTRAL, dot: 'bg-zinc-400', label: 'Not started' },
  open: { className: NEUTRAL, dot: 'bg-zinc-400', label: 'To do' },
  late_window: { className: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500', label: 'Late accepted' },
  missing: { className: 'bg-red-50 text-red-700', dot: 'bg-red-500', label: 'Missed' },
  submitted: { className: NEUTRAL, dot: 'bg-zinc-900', label: 'Submitted' },
  late_submitted: { className: NEUTRAL, dot: 'bg-zinc-900', label: 'Submitted late' },
  graded_unreturned: { className: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', label: 'Graded' },
  graded_returned: { className: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', label: 'Graded' },
};

type CompletionFilter = 'all' | 'todo' | 'submitted' | 'missed' | 'graded';

const FILTER_LABEL: Record<CompletionFilter, string> = {
  all: 'All',
  todo: 'To do',
  submitted: 'Submitted',
  missed: 'Missed',
  graded: 'Graded',
};

const FILTER_KEYS = Object.keys(FILTER_LABEL) as CompletionFilter[];

const FILTER_STATUSES: Record<CompletionFilter, ReadonlySet<ActivityStatus>> = {
  all: new Set<ActivityStatus>([
    'not_started',
    'open',
    'late_window',
    'missing',
    'submitted',
    'late_submitted',
    'graded_unreturned',
    'graded_returned',
  ]),
  todo: new Set<ActivityStatus>(['not_started', 'open', 'late_window']),
  submitted: new Set<ActivityStatus>(['submitted', 'late_submitted']),
  missed: new Set<ActivityStatus>(['missing']),
  graded: new Set<ActivityStatus>(['graded_unreturned', 'graded_returned']),
};

function isModuleTerm(v: string | null): v is ModuleTerm {
  return v !== null && (MODULE_TERMS as readonly string[]).includes(v);
}

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function formatDueTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

function timeHint(a: ActivityWithStudentState): { text: string; className: string } | null {
  if (a.status === 'missing') return { text: 'Missed', className: 'font-semibold text-red-700' };
  if (a.status === 'late_window') return { text: 'Past due, late accepted', className: 'font-semibold text-amber-700' };
  if (a.status !== 'open' && a.status !== 'not_started') return null;
  const msLeft = new Date(a.dueAt).getTime() - Date.now();
  if (msLeft <= 0) return null;
  const hours = Math.floor(msLeft / 3_600_000);
  if (hours < 24) {
    return { text: hours <= 0 ? 'Due within the hour' : `${hours} hour${hours === 1 ? '' : 's'} left`, className: 'font-semibold text-red-700' };
  }
  const days = Math.ceil(msLeft / 86_400_000);
  return { text: `${days} day${days === 1 ? '' : 's'} left`, className: days <= 7 ? 'font-semibold text-amber-700' : 'text-zinc-500' };
}

export default function StudentActivitiesTab({ classId, activities }: StudentActivitiesTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filterParam = searchParams.get('filter');
  const filter: CompletionFilter =
    filterParam === 'todo' || filterParam === 'submitted' || filterParam === 'missed' || filterParam === 'graded'
      ? filterParam
      : 'all';

  function replaceParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function setFilter(next: CompletionFilter) {
    replaceParam('filter', next === 'all' ? null : next);
  }

  // Default term: first one with something to do, else first with activities
  const termParam = searchParams.get('term');
  const [activeTerm, setActiveTerm] = useState<ModuleTerm>(() => {
    if (isModuleTerm(termParam)) return termParam;
    const withTodo = MODULE_TERMS.find((t) =>
      activities.some((a) => a.term === t && FILTER_STATUSES.todo.has(a.status)),
    );
    const withAny = MODULE_TERMS.find((t) => activities.some((a) => a.term === t));
    return withTodo ?? withAny ?? 'prelim';
  });

  function selectTerm(t: ModuleTerm) {
    setActiveTerm(t);
    replaceParam('term', t);
  }

  const inTerm = useMemo(() => activities.filter((a) => a.term === activeTerm), [activities, activeTerm]);

  const filterCounts = useMemo(() => {
    const counts: Record<CompletionFilter, number> = { all: inTerm.length, todo: 0, submitted: 0, missed: 0, graded: 0 };
    for (const a of inTerm) {
      if (FILTER_STATUSES.todo.has(a.status)) counts.todo++;
      if (FILTER_STATUSES.submitted.has(a.status)) counts.submitted++;
      if (FILTER_STATUSES.missed.has(a.status)) counts.missed++;
      if (FILTER_STATUSES.graded.has(a.status)) counts.graded++;
    }
    return counts;
  }, [inTerm]);

  const visible = inTerm
    .filter((a) => FILTER_STATUSES[filter].has(a.status))
    .sort((x, y) => x.displayOrder - y.displayOrder);

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
        <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <ClipboardList className="h-6 w-6" />
        </span>
        <h2 className="text-base font-bold text-zinc-900">No activities yet</h2>
        <p className="text-sm text-zinc-500">Your teacher hasn&apos;t posted any activities for this class.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Term tabs */}
      <div role="tablist" aria-label="Grading period" className="inline-flex rounded-xl border border-zinc-200 bg-white p-1">
        {MODULE_TERMS.map((t) => {
          const active = t === activeTerm;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTerm(t)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm transition',
                active
                  ? 'bg-red-600 font-semibold text-white shadow-[0_4px_12px_rgba(220,38,38,0.25)]'
                  : 'font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900',
              )}
            >
              {MODULE_TERM_LABELS[t]}
            </button>
          );
        })}
      </div>

      {/* Table card */}
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div role="tablist" aria-label="Filter activities" className="flex flex-wrap gap-1 border-b border-zinc-100 px-5 py-3">
          {FILTER_KEYS.map((key) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(key)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[13px] transition',
                  active ? 'bg-zinc-900 font-semibold text-white' : 'font-medium text-zinc-600 hover:bg-zinc-100',
                )}
              >
                {FILTER_LABEL[key]}{' '}
                <span
                  className={
                    active
                      ? 'text-white/60'
                      : key === 'missed' && filterCounts.missed > 0
                        ? 'font-semibold text-red-600'
                        : 'text-zinc-400'
                  }
                >
                  {filterCounts[key]}
                </span>
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500">
            {inTerm.length === 0
              ? `No activities in ${MODULE_TERM_LABELS[activeTerm]} yet.`
              : `Nothing under "${FILTER_LABEL[filter]}" in ${MODULE_TERM_LABELS[activeTerm]}.`}
          </div>
        ) : (
          <>
            {/* Column headers (desktop) */}
            <div
              className={cn(
                'hidden border-b border-zinc-100 bg-zinc-50/60 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 md:grid',
                ROW_GRID,
              )}
            >
              <span>Title</span>
              <span>Due</span>
              <span>Score</span>
              <span>Status</span>
              <span className="sr-only">Action</span>
            </div>
            <ul className="divide-y divide-zinc-100">
              {visible.map((a) => (
                <ActivityRow key={a.id} activity={a} classId={classId} />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function ActivityRow({ activity, classId }: { activity: ActivityWithStudentState; classId: string }) {
  const isQuiz = activity.activityKind === 'quiz';
  const hint = timeHint(activity);
  const href = `/student/classes/${classId}/activities/${activity.id}`;
  const isTodo = FILTER_STATUSES.todo.has(activity.status);
  const isGraded = FILTER_STATUSES.graded.has(activity.status);
  // A saved draft is still "To do" — it hasn't been submitted yet.
  const hasDraft = isTodo && activity.submission?.isDraft === true;
  const pill = hasDraft
    ? { className: NEUTRAL, dot: 'bg-zinc-400', label: 'Draft' }
    : STATUS_PILL[activity.status];

  const action = hasDraft
    ? { label: 'Continue', primary: true }
    : isTodo
      ? { label: isQuiz ? 'Take quiz' : activity.status === 'late_window' ? 'Submit late' : 'Start', primary: true }
      : isGraded
        ? { label: 'See score', primary: false }
        : { label: 'View', primary: false };

  return (
    <li
      className={cn(
        'relative flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition hover:bg-zinc-50/70',
        ROW_GRID,
      )}
    >
      {/* Title */}
      <div className="min-w-0 basis-full md:basis-auto">
        <Link
          href={href}
          className="block truncate text-[15px] font-semibold text-zinc-900 after:absolute after:inset-0 after:content-[''] hover:text-red-700"
        >
          {activity.title}
        </Link>
        <p className="mt-0.5 truncate text-[13px] text-zinc-500">
          {isQuiz ? 'Quiz' : 'Activity'}
          {hint && (
            <>
              {' · '}
              <span className={hint.className}>{hint.text}</span>
            </>
          )}
          {activity.allowLate && isTodo && activity.status !== 'late_window' && ' · late accepted'}
        </p>
      </div>

      {/* Due */}
      <div className="text-[13px]">
        <span className="font-medium text-zinc-800">{formatDueDate(activity.dueAt)}</span>
        <span className="ml-1 text-zinc-500 md:ml-0 md:block">{formatDueTime(activity.dueAt)}</span>
      </div>

      {/* Score */}
      <div className="text-[13px]">
        {activity.grade ? (
          <span className="font-semibold text-zinc-900">
            {activity.grade.score}
            <span className="font-normal text-zinc-400"> / {activity.maxPoints}</span>
          </span>
        ) : (
          <span className="text-zinc-500">{activity.maxPoints} pts</span>
        )}
      </div>

      {/* Status */}
      <div>
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', pill.className)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', pill.dot)} />
          {pill.label}
        </span>
      </div>

      {/* Action */}
      <div className="ml-auto md:ml-0 md:text-right">
        <Link
          href={href}
          className={cn(
            'relative z-10 inline-flex items-center justify-center rounded-lg px-3.5 py-1.5 text-sm font-semibold transition',
            action.primary
              ? 'bg-red-600 text-white shadow-[0_4px_12px_rgba(220,38,38,0.22)] hover:bg-red-700'
              : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
          )}
        >
          {action.label}
        </Link>
      </div>
    </li>
  );
}