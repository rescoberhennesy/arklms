'use client';

import { useState, useMemo, useTransition, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw, AlertCircle, Clock } from 'lucide-react';
import { listQuizAttemptsForQuiz } from '@/lib/actions/quizzes';
import type { QuizAttemptListItem } from '@/lib/types/quizzes';
import { useServerSyncedState } from '@/lib/hooks/useServerSyncedState';
import SubmissionsOverview, { initialsOf, type RosterStudent } from '@/components/teacher/SubmissionsOverview';

interface QuizAttemptsPanelProps {
  activityId: string;
  classId: string;
  quizTotalPoints: number;
  initialAttempts: QuizAttemptListItem[];
  roster: RosterStudent[];
  dueAt: string;
}

function attemptsSignature(rows: QuizAttemptListItem[]): string {
  return rows
    .map(
      (r) =>
        `${r.id}:${r.submittedAt ?? '-'}:${r.needsManualReview ? 1 : 0}:${r.hasGrade ? 1 : 0}:${r.gradeReleasedAt ?? '-'}:${r.displayScore ?? '-'}:${r.isLate ? 1 : 0}`,
    )
    .join('|');
}

type Filter = 'all' | 'needs_review' | 'in_progress' | 'graded' | 'missing';

function pillFor(row: QuizAttemptListItem): { cls: string; label: string } {
  if (!row.submittedAt) return { cls: 'bg-blue-50 text-blue-700', label: 'In progress' };
  if (row.needsManualReview) return { cls: 'bg-red-50 text-red-700', label: 'Needs review' };
  if (row.hasGrade && row.gradeReleasedAt) return { cls: 'bg-emerald-50 text-emerald-700', label: 'Graded' };
  if (row.hasGrade) return { cls: 'bg-purple-50 text-purple-700', label: 'Not released' };
  return { cls: 'bg-zinc-100 text-zinc-700', label: 'Submitted' };
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function QuizAttemptsPanel({
  activityId,
  classId,
  quizTotalPoints,
  initialAttempts,
  roster,
  dueAt,
}: QuizAttemptsPanelProps) {
  const [attempts, setAttempts] = useServerSyncedState(initialAttempts, attemptsSignature);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefreshing] = useTransition();
  const pastDue = Date.now() > new Date(dueAt).getTime();

  const handleRefresh = useCallback(() => {
    setError(null);
    startRefreshing(async () => {
      try {
        setAttempts(await listQuizAttemptsForQuiz(activityId));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to refresh attempts.');
      }
    });
  }, [activityId, setAttempts]);

  // Students on the roster with no attempt at all
    // Students on the roster with no attempt at all
  const missingStudents = useMemo(() => {
    const withAttempt = new Set(attempts.map((a) => a.studentId));
    return roster.filter((r) => !withAttempt.has(r.student_id));
  }, [attempts, roster]);

  const counts = useMemo(
    () => ({
      all: attempts.length + missingStudents.length,
      needs_review: attempts.filter((a) => a.submittedAt && a.needsManualReview).length,
      in_progress: attempts.filter((a) => !a.submittedAt).length,
      graded: attempts.filter((a) => a.hasGrade).length,
      missing: missingStudents.length,
      submitted: attempts.filter((a) => a.submittedAt).length,
    }),
    [attempts, missingStudents],
  );

  const showAttempts = filter !== 'missing';
  const showMissing = filter === 'all' || filter === 'missing';
  const filteredAttempts = attempts.filter((a) => {
    if (filter === 'needs_review') return !!a.submittedAt && a.needsManualReview;
    if (filter === 'in_progress') return !a.submittedAt;
    if (filter === 'graded') return a.hasGrade;
    return true;
  });

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'needs_review', label: 'Needs review', count: counts.needs_review },
    { key: 'in_progress', label: 'In progress', count: counts.in_progress },
    { key: 'graded', label: 'Graded', count: counts.graded },
    { key: 'missing', label: pastDue ? 'Missing' : 'Not yet', count: counts.missing },
  ];

  const nothing =
    (showAttempts ? filteredAttempts.length : 0) + (showMissing ? missingStudents.length : 0) === 0;

  return (
    <div className="space-y-4">
      <SubmissionsOverview
        total={Math.max(roster.length, counts.submitted)}
        submitted={counts.submitted}
        toGrade={counts.needs_review}
        graded={counts.graded}
        missing={counts.missing + counts.in_progress}
        dueAt={dueAt}
      />

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-1 border-b border-zinc-100 px-4 py-3">
          {chips.map((c) => {
            const active = filter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilter(c.key)}
                className={`rounded-lg px-3 py-1.5 text-[13px] transition ${
                  active ? 'bg-zinc-900 font-semibold text-white' : 'font-medium text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                {c.label} <span className={active ? 'text-white/60' : 'text-zinc-400'}>{c.count}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
        )}

        {nothing ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">
            {roster.length === 0 ? 'No students in this class yet.' : 'Nobody here.'}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {showAttempts &&
              filteredAttempts.map((row) => {
                const pill = pillFor(row);
                return (
                  <li key={row.id}>
                    <Link
                      href={`/teacher/classes/${classId}/activities/${activityId}/attempts/${row.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition hover:bg-zinc-50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-semibold text-red-700">
                        {initialsOf(row.studentName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-zinc-900">
                          {row.studentName || 'Unknown student'}
                        </p>
                        <p className="flex flex-wrap gap-x-2 text-xs text-zinc-500">
                          <span>{row.submittedAt ? fmt(row.submittedAt) : `Started ${fmt(row.startedAt)}`}</span>
                          {row.isLate && (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                              <Clock className="h-3 w-3" />
                              Late
                            </span>
                          )}
                          {row.needsManualReview && (
                            <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                              <AlertCircle className="h-3 w-3" />
                              Essay to check
                            </span>
                          )}
                          {row.displayScore !== null && (
                            <span className="font-semibold text-zinc-700">
                              {row.displayScore} / {quizTotalPoints}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pill.cls}`}>{pill.label}</span>
                      <span
                        className={`text-xs font-bold ${row.needsManualReview && row.submittedAt ? 'text-red-600' : 'text-zinc-500'}`}
                      >
                        {row.needsManualReview && row.submittedAt ? 'Review' : 'View'}
                      </span>
                    </Link>
                  </li>
                );
              })}
            {showMissing &&
              missingStudents.map((r) => (
                <li key={r.student_id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-400">
                    {initialsOf(r.full_name ?? r.email)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-600">{r.full_name ?? r.email ?? 'Unknown'}</p>
                    <p className="text-xs text-zinc-400">Hasn&apos;t started</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      pastDue ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-500'
                    }`}
                  >
                    {pastDue ? 'Missing' : 'Not yet'}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}