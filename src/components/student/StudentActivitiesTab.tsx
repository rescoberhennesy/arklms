'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  type ActivityWithStudentState,
  type ActivityStatus,
} from '@/lib/types/activities';
import {
  type ModuleTerm,
  MODULE_TERMS,
  MODULE_TERM_LABELS,
} from '@/lib/types/modules';
import {
  Calendar,
  CheckCircle2,
  Award,
  AlertCircle,
  Clock,
} from 'lucide-react';

interface StudentActivitiesTabProps {
  classId: string;
  activities: ActivityWithStudentState[];
}

const TERM_HEADER_ACCENTS: Record<ModuleTerm, string> = {
  prelim: 'bg-blue-50 text-blue-800 border-blue-200',
  midterm: 'bg-purple-50 text-purple-800 border-purple-200',
  prefinal: 'bg-amber-50 text-amber-800 border-amber-200',
  final: 'bg-rose-50 text-rose-800 border-rose-200',
};

const STATUS_PILL: Record<
  ActivityStatus,
  { className: string; label: string }
> = {
  not_started: { className: 'bg-gray-100 text-gray-600', label: 'Not started' },
  open: { className: 'bg-blue-100 text-blue-800', label: 'Open' },
  late_window: {
    className: 'bg-amber-100 text-amber-800',
    label: 'Late accepted',
  },
  missing: { className: 'bg-red-100 text-red-800', label: 'Missing' },
  submitted: { className: 'bg-blue-100 text-blue-800', label: 'Submitted' },
  late_submitted: {
    className: 'bg-amber-100 text-amber-800',
    label: 'Submitted (late)',
  },
  graded_unreturned: {
    className: 'bg-purple-100 text-purple-800',
    label: 'Graded',
  },
  graded_returned: {
    className: 'bg-green-100 text-green-800',
    label: 'Graded',
  },
};

// Session 13 completion-tracking filter buckets.
// "To do" = anything not yet submitted that the student can still act on,
// plus 'missing' is excluded (it has its own bucket). 'not_started' is
// student-side dead code (students can't see unpublished activities), but
// included for type-completeness.
type CompletionFilter = 'all' | 'todo' | 'submitted' | 'missed' | 'graded';

const FILTER_LABEL: Record<CompletionFilter, string> = {
  all: 'All',
  todo: 'To do',
  submitted: 'Submitted',
  missed: 'Missed',
  graded: 'Graded',
};

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

export default function StudentActivitiesTab({
  classId,
  activities,
}: StudentActivitiesTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL-driven filter (Session 13).
  const filterParam = searchParams.get('filter');
  const filter: CompletionFilter =
    filterParam === 'todo' ||
    filterParam === 'submitted' ||
    filterParam === 'missed' ||
    filterParam === 'graded'
      ? filterParam
      : 'all';

  function setFilter(next: CompletionFilter) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') {
      params.delete('filter');
    } else {
      params.set('filter', next);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Per-bucket counts for the filter pill badges — based on the full
  // unfiltered list so users can see how many are in each bucket before
  // clicking. "All" is the total.
  const filterCounts = useMemo(() => {
    const counts: Record<CompletionFilter, number> = {
      all: activities.length,
      todo: 0,
      submitted: 0,
      missed: 0,
      graded: 0,
    };
    for (const a of activities) {
      if (FILTER_STATUSES.todo.has(a.status)) counts.todo++;
      if (FILTER_STATUSES.submitted.has(a.status)) counts.submitted++;
      if (FILTER_STATUSES.missed.has(a.status)) counts.missed++;
      if (FILTER_STATUSES.graded.has(a.status)) counts.graded++;
    }
    return counts;
  }, [activities]);

  // Apply filter, then group by term. Terms with zero matches after
  // filtering are hidden (no empty term cards bleeding through).
  const filtered = useMemo(
    () => activities.filter((a) => FILTER_STATUSES[filter].has(a.status)),
    [activities, filter],
  );

  const byTerm = new Map<ModuleTerm, ActivityWithStudentState[]>();
  for (const a of filtered) {
    const list = byTerm.get(a.term) ?? [];
    list.push(a);
    byTerm.set(a.term, list);
  }
  for (const list of byTerm.values()) {
    list.sort((x, y) => x.displayOrder - y.displayOrder);
  }

  const visibleTerms = MODULE_TERMS.filter(
    (t) => (byTerm.get(t)?.length ?? 0) > 0,
  );

  // True empty-state (no activities at all in this class).
  if (activities.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
        <h2 className="text-lg font-semibold text-gray-900">
          No activities yet
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Your teacher hasn&apos;t posted any activities for this class.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter pills */}
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

      {visibleTerms.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
          <p className="text-sm text-gray-600">
            No activities match the &quot;{FILTER_LABEL[filter]}&quot; filter.
          </p>
        </div>
      ) : (
        visibleTerms.map((term) => (
          <TermTable
            key={term}
            term={term}
            classId={classId}
            activities={byTerm.get(term) ?? []}
          />
        ))
      )}
    </div>
  );
}

interface TermTableProps {
  term: ModuleTerm;
  classId: string;
  activities: ActivityWithStudentState[];
}

function TermTable({ term, classId, activities }: TermTableProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div
        className={`border-b px-4 py-2 text-sm font-semibold uppercase tracking-wide ${TERM_HEADER_ACCENTS[term]}`}
      >
        {MODULE_TERM_LABELS[term]}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Activity</th>
              <th className="px-4 py-2 text-left font-medium">Start</th>
              <th className="px-4 py-2 text-left font-medium">Due</th>
              <th className="px-4 py-2 text-center font-medium">Submitted</th>
              <th className="px-4 py-2 text-center font-medium">Graded</th>
              <th className="px-4 py-2 text-right font-medium">Score</th>
              <th className="px-4 py-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {activities.map((a) => (
              <ActivityRow key={a.id} activity={a} classId={classId} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface ActivityRowProps {
  activity: ActivityWithStudentState;
  classId: string;
}

function ActivityRow({ activity, classId }: ActivityRowProps) {
  const submitted = activity.submission !== null;
  const graded = activity.grade !== null;
  const statusPill = STATUS_PILL[activity.status];

  return (
    <tr className="hover:bg-gray-50/60">
      <td className="px-4 py-3">
        <Link
          href={`/student/classes/${classId}/activities/${activity.id}`}
          className="font-medium text-gray-900 hover:text-red-600"
        >
          {activity.title}
        </Link>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
          <Award className="h-3 w-3" />
          {activity.maxPoints} pts
          {activity.allowLate && (
            <span className="text-amber-600">· late accepted</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {new Date(activity.startAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </td>
      <td className="px-4 py-3 text-xs whitespace-nowrap">
        <span
          className={`inline-flex items-center gap-1 ${
            activity.status === 'missing'
              ? 'font-semibold text-red-700'
              : 'text-gray-600'
          }`}
        >
          <Calendar className="h-3 w-3" />
          {new Date(activity.dueAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        {submitted ? (
          <CheckCircle2 className="mx-auto h-4 w-4 text-green-600" />
        ) : activity.status === 'missing' ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
            <AlertCircle className="h-3.5 w-3.5" />
            Missing
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        {graded ? (
          <CheckCircle2 className="mx-auto h-4 w-4 text-green-600" />
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {graded && activity.grade ? (
          <span>
            <span className="font-semibold text-gray-900">
              {activity.grade.score}
            </span>
            <span className="text-gray-400"> / {activity.maxPoints}</span>
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusPill.className}`}
        >
          {activity.status === 'late_window' && (
            <Clock className="h-3 w-3" />
          )}
          {statusPill.label}
        </span>
      </td>
    </tr>
  );
}
