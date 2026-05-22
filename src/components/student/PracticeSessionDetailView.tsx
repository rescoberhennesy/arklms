// src/components/student/PracticeSessionDetailView.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Play,
  RotateCw,
  Trophy,
  Calendar,
  Hash,
  FileText,
  BookOpen,
  Loader2,
  Trash2,
} from 'lucide-react';
import type { PracticeSessionDetail } from '@/lib/types/practice';
import {
  PRACTICE_DIFFICULTY_LABELS,
  PRACTICE_QUESTION_KIND_LABELS,
} from '@/lib/types/practice';
import {
  startPracticeAttempt,
  deletePracticeSession,
} from '@/lib/actions/practice';

interface Props {
  detail: PracticeSessionDetail;
}

export default function PracticeSessionDetailView({ detail }: Props) {
  const router = useRouter();
  const { session, questions, attempts } = detail;
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const completedAttempts = attempts.filter((a) => a.submittedAt !== null);
  const inProgressAttempt = attempts.find((a) => a.submittedAt === null) ?? null;

  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
  const bestAttempt = completedAttempts.reduce<typeof completedAttempts[number] | null>(
    (best, a) => {
      if (a.score === null) return best;
      if (!best || (best.score ?? 0) < a.score) return a;
      return best;
    },
    null,
  );

  // Tally question kinds for the "what's in this session" pill row
  const kindCounts = questions.reduce<Record<string, number>>((acc, q) => {
    acc[q.questionKind] = (acc[q.questionKind] ?? 0) + 1;
    return acc;
  }, {});

  async function handleStart() {
    setStarting(true);
    try {
      const { attempt } = await startPracticeAttempt(session.id);
      router.push(`/student/practice/${session.id}/attempt/${attempt.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start attempt');
      setStarting(false);
    }
  }

  async function handleResume() {
    if (!inProgressAttempt) return;
    router.push(`/student/practice/${session.id}/attempt/${inProgressAttempt.id}`);
  }

  async function handleDelete() {
    if (!confirm('Delete this practice session and all attempts? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deletePracticeSession(session.id);
      router.push('/student/practice');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <Link
        href="/student/practice"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to AI Practice
      </Link>

      {/* Header card */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">
              {session.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">
                {PRACTICE_DIFFICULTY_LABELS[session.difficulty]}
              </span>
              <span className="inline-flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {questions.length} questions · {totalPoints} pts
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Created {new Date(session.createdAt).toLocaleDateString()}
              </span>
              <span className="inline-flex items-center gap-1">
                {session.sourceKind === 'lesson' ? (
                  <>
                    <BookOpen className="h-3 w-3" />
                    From a lesson
                  </>
                ) : (
                  <>
                    <FileText className="h-3 w-3" />
                    From upload{session.sourceFileNames.length > 0 ? `: ${session.sourceFileNames.join(', ')}` : ''}
                  </>
                )}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Delete session"
            className="rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {session.sourceNote && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span className="font-semibold">Note from AI:</span> {session.sourceNote}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {Object.entries(kindCounts).map(([kind, n]) => (
            <span
              key={kind}
              className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700"
            >
              {n}× {PRACTICE_QUESTION_KIND_LABELS[kind as keyof typeof PRACTICE_QUESTION_KIND_LABELS]}
            </span>
          ))}
        </div>

        {/* Primary action */}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          {inProgressAttempt ? (
            <button
              type="button"
              onClick={handleResume}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
            >
              <Play className="h-4 w-4" />
              Resume attempt
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              disabled={starting || questions.length === 0}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {starting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : completedAttempts.length === 0 ? (
                <Play className="h-4 w-4" />
              ) : (
                <RotateCw className="h-4 w-4" />
              )}
              {completedAttempts.length === 0 ? 'Start practice' : 'Retake'}
            </button>
          )}
        </div>
      </div>

      {/* Past attempts */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          {completedAttempts.length === 0
            ? 'No attempts yet'
            : `Past attempts (${completedAttempts.length})`}
        </h2>

        {completedAttempts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <Trophy className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm italic text-gray-500">
              Take your first attempt to see your results here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {completedAttempts.map((a, idx) => {
              const pct =
                a.score !== null && a.maxScore && a.maxScore > 0
                  ? Math.round((a.score / a.maxScore) * 100)
                  : 0;
              const isBest = bestAttempt?.id === a.id;
              return (
                <li
                  key={a.id}
                  className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">
                          Attempt #{completedAttempts.length - idx}
                        </span>
                        {isBest && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            <Trophy className="h-3 w-3" />
                            Best
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {a.submittedAt && new Date(a.submittedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-base font-bold ${
                          pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600'
                        }`}
                      >
                        {pct}%
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {a.score}/{a.maxScore}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}