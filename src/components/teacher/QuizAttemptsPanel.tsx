
'use client';

import { useState, useMemo, useTransition, useCallback } from 'react';
import Link from 'next/link';
import {
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Inbox,
  Filter,
} from 'lucide-react';
import { listQuizAttemptsForQuiz } from '@/lib/actions/quizzes';
import type { QuizAttemptListItem } from '@/lib/types/quizzes';
import { useServerSyncedState } from '@/lib/hooks/useServerSyncedState';

interface QuizAttemptsPanelProps {
  activityId: string;
  classId: string;
  quizTotalPoints: number;
  initialAttempts: QuizAttemptListItem[];
}

function attemptsSignature(rows: QuizAttemptListItem[]): string {
  // Cheap signature: id + submitted_at + needsManualReview + grade state.
  // Drives signature-based prop-sync via useServerSyncedState when the
  // parent re-fetches.
  return rows
    .map(
      (r) =>
        `${r.id}:${r.submittedAt ?? '-'}:${r.needsManualReview ? 1 : 0}:${r.hasGrade ? 1 : 0}:${r.gradeReleasedAt ?? '-'}:${r.displayScore ?? '-'}`,
    )
    .join('|');
}

type Filter = 'all' | 'needs_review' | 'in_progress' | 'graded';

function statusPillFor(row: QuizAttemptListItem): {
  className: string;
  label: string;
} {
  if (!row.submittedAt) {
    return {
      className: 'bg-blue-100 text-blue-800',
      label: 'In progress',
    };
  }
  if (row.needsManualReview) {
    return {
      className: 'bg-amber-100 text-amber-800',
      label: 'Needs manual review',
    };
  }
  if (row.hasGrade && row.gradeReleasedAt) {
    return {
      className: 'bg-green-100 text-green-800',
      label: 'Graded & released',
    };
  }
  if (row.hasGrade && !row.gradeReleasedAt) {
    return {
      className: 'bg-purple-100 text-purple-800',
      label: 'Graded (not released)',
    };
  }
  // Submitted with no manual review pending and no grade row yet — this
  // shouldn't normally happen (submit_quiz_attempt creates the grade), but
  // be defensive.
  return {
    className: 'bg-gray-100 text-gray-700',
    label: 'Submitted',
  };
}

export default function QuizAttemptsPanel({
  activityId,
  classId,
  quizTotalPoints,
  initialAttempts,
}: QuizAttemptsPanelProps) {
  const [attempts, setAttempts] = useServerSyncedState(
    initialAttempts,
    attemptsSignature,
  );
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefreshing] = useTransition();

  const handleRefresh = useCallback(() => {
    setError(null);
    startRefreshing(async () => {
      try {
        const next = await listQuizAttemptsForQuiz(activityId);
        setAttempts(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to refresh attempts.');
      }
    });
  }, [activityId, setAttempts]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'needs_review':
        return attempts.filter((a) => a.needsManualReview);
      case 'in_progress':
        return attempts.filter((a) => !a.submittedAt);
      case 'graded':
        return attempts.filter((a) => a.hasGrade);
      case 'all':
      default:
        return attempts;
    }
  }, [attempts, filter]);

  const counts = useMemo(() => {
    return {
      all: attempts.length,
      needs_review: attempts.filter((a) => a.needsManualReview).length,
      in_progress: attempts.filter((a) => !a.submittedAt).length,
      graded: attempts.filter((a) => a.hasGrade).length,
    };
  }, [attempts]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          <Inbox className="h-4 w-4" />
          Attempts ({attempts.length})
        </h2>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          aria-label="Refresh attempts"
        >
          {refreshing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {attempts.length === 0 ? (
        <p className="py-6 text-center text-sm italic text-gray-400">
          No attempts yet. Once students start the quiz, their attempts will
          appear here.
        </p>
      ) : (
        <>
          {/* Filter pills */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <Filter className="h-3 w-3" />
              Filter:
            </span>
            {(
              [
                ['all', 'All', counts.all],
                ['needs_review', 'Needs review', counts.needs_review],
                ['in_progress', 'In progress', counts.in_progress],
                ['graded', 'Graded', counts.graded],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                  filter === key
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm italic text-gray-400">
              No attempts match this filter.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((row) => {
                const pill = statusPillFor(row);
                const scoreLabel =
                  row.displayScore !== null
                    ? `${row.displayScore} / ${quizTotalPoints}`
                    : '—';
                return (
                  <li key={row.id}>
                    <Link
                      href={`/teacher/classes/${classId}/activities/${activityId}/attempts/${row.id}`}
                      className="flex items-center gap-3 py-3 hover:bg-gray-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-gray-900">
                            {row.studentName || 'Unknown student'}
                          </span>
                          {row.needsManualReview && (
                            <span
                              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                              title="At least one essay or short answer awaits manual grading"
                            >
                              <AlertCircle className="h-2.5 w-2.5" />
                              Manual
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-gray-500">
                          {row.studentEmail}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                          {row.submittedAt ? (
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Submitted{' '}
                              {new Date(row.submittedAt).toLocaleString()}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Started {new Date(row.startedAt).toLocaleString()}
                            </span>
                          )}
                          {row.gradeReleasedAt && (
                            <span className="inline-flex items-center gap-1">
                              Released{' '}
                              {new Date(row.gradeReleasedAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${pill.className}`}
                        >
                          {pill.label}
                        </span>
                        <span className="text-sm font-semibold text-gray-800">
                          {scoreLabel}
                        </span>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
