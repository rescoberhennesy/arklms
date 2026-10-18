'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { ClipboardList, ListChecks } from 'lucide-react';
import { type ActivityWithStudentState, type ActivityStatus } from '@/lib/types/activities';
import { type ModuleTerm, MODULE_TERMS, MODULE_TERM_LABELS } from '@/lib/types/modules';

interface StudentActivitiesTabProps {
  classId: string;
  activities: ActivityWithStudentState[];
}

const STATUS_PILL: Record<ActivityStatus, { className: string; label: string }> = {
  not_started: { className: 'bg-gray-100 text-gray-600', label: 'Not started' },
  open: { className: 'bg-amber-50 text-amber-700', label: 'To do' },
  late_window: { className: 'bg-amber-50 text-amber-700', label: 'Late accepted' },
  missing: { className: 'bg-red-50 text-red-700', label: 'Missed' },
  submitted: { className: 'bg-blue-50 text-blue-700', label: 'Submitted' },
  late_submitted: { className: 'bg-blue-50 text-blue-700', label: 'Submitted late' },
  graded_unreturned: { className: 'bg-purple-50 text-purple-700', label: 'Graded' },
  graded_returned: { className: 'bg-green-50 text-green-700', label: 'Graded' },
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

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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
  return { text: `${days} day${days === 1 ? '' : 's'} left`, className: days <= 7 ? 'font-semibold text-amber-700' : 'text-gray-500' };
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

  const termCounts = useMemo(() => {
    const m = new Map<ModuleTerm, number>();
    for (const t of MODULE_TERMS) m.set(t, 0);
    for (const a of activities) m.set(a.term, (m.get(a.term) ?? 0) + 1);
    return m;
  }, [activities]);

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
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <ClipboardList className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">No activities yet</h2>
        <p className="text-sm text-gray-600">Your teacher hasn&apos;t posted any activities for this class.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Term tabs */}
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
              <span className={`rounded-full px-1.5 text-[11px] font-semibold ${active ? 'bg-white text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                {termCounts.get(t) ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* List card */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div role="tablist" aria-label="Filter activities" className="flex flex-wrap gap-1 border-b border-gray-100 px-4 py-2.5">
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
                {FILTER_LABEL[key]}{' '}
                <span className={active ? 'text-white/70' : key === 'missed' && filterCounts.missed > 0 ? 'text-red-600' : 'text-gray-400'}>
                  {filterCounts[key]}
                </span>
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            {inTerm.length === 0
              ? `No activities in ${MODULE_TERM_LABELS[activeTerm]} yet.`
              : `Nothing under "${FILTER_LABEL[filter]}" in ${MODULE_TERM_LABELS[activeTerm]}.`}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map((a) => (
              <ActivityRow key={a.id} activity={a} classId={classId} />
            ))}
          </ul>
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
  const pill = hasDraft ? { className: 'bg-gray-100 text-gray-700', label: 'Draft' } : STATUS_PILL[activity.status];

  const action = hasDraft
    ? { label: 'Continue', primary: true }
    : isTodo
    ? { label: isQuiz ? 'Take quiz' : activity.status === 'late_window' ? 'Submit late' : 'Start', primary: true }
    : isGraded
      ? { label: 'See score', primary: false }
      : { label: 'View', primary: false };

  return (
    <li className="flex flex-wrap items-center gap-4 px-4 py-4">
      <div
        aria-hidden="true"
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          isQuiz ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
        }`}
      >
        {isQuiz ? <ListChecks className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}
      </div>

      <div className="min-w-[220px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href} className="truncate text-[15px] font-semibold text-gray-900 hover:text-red-600">
            {activity.title}
          </Link>
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${pill.className}`}>{pill.label}</span>
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
          {activity.grade ? (
            <span className="font-semibold text-gray-900">
              {activity.grade.score} / {activity.maxPoints}
            </span>
          ) : (
            `${activity.maxPoints} pts`
          )}
          {activity.allowLate && isTodo && activity.status !== 'late_window' && ' · late accepted'}
        </p>
      </div>

      <Link
        href={href}
        className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
          action.primary
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        {action.label}
      </Link>
    </li>
  );
}