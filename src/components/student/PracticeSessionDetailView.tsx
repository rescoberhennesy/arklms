// src/components/student/PracticeSessionDetailView.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Play, RotateCw, Trophy, FileText, BookOpen, Loader2, Trash2, Info } from 'lucide-react';
import type { PracticeSessionDetail } from '@/lib/types/practice';
import { PRACTICE_DIFFICULTY_LABELS, PRACTICE_QUESTION_KIND_LABELS } from '@/lib/types/practice';
import { startPracticeAttempt, deletePracticeSession } from '@/lib/actions/practice';

interface Props {
  detail: PracticeSessionDetail;
}

// Neutral shades for the question-mix bar (charcoal → light).
const MIX_SHADES = ['bg-zinc-900', 'bg-zinc-600', 'bg-zinc-400', 'bg-zinc-300'];

function pctTone(pct: number) {
  if (pct >= 80) return 'text-emerald-700 bg-emerald-50';
  if (pct >= 50) return 'text-amber-700 bg-amber-50';
  return 'text-red-700 bg-red-50';
}

export default function PracticeSessionDetailView({ detail }: Props) {
  const router = useRouter();
  const { session, questions, attempts } = detail;
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const completedAttempts = attempts.filter((a) => a.submittedAt !== null);
  const inProgressAttempt = attempts.find((a) => a.submittedAt === null) ?? null;

  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
  const bestAttempt = completedAttempts.reduce<(typeof completedAttempts)[number] | null>((best, a) => {
    if (a.score === null) return best;
    if (!best || (best.score ?? 0) < a.score) return a;
    return best;
  }, null);

  // Count + total points per question kind, most common first.
  const kindStats = Object.entries(
    questions.reduce<Record<string, { count: number; points: number }>>((acc, q) => {
      const cur = acc[q.questionKind] ?? { count: 0, points: 0 };
      acc[q.questionKind] = { count: cur.count + 1, points: cur.points + q.points };
      return acc;
    }, {}),
  ).sort((a, b) => b[1].count - a[1].count);

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

  function handleResume() {
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

  const sourceLabel =
    session.sourceKind === 'lesson'
      ? 'From a lesson'
      : `From upload${session.sourceFileNames.length > 0 ? ` · ${session.sourceFileNames.join(', ')}` : ''}`;

  const stats = [
    { label: 'Questions', value: String(questions.length) },
    { label: 'Total points', value: String(totalPoints) },
    { label: 'Difficulty', value: PRACTICE_DIFFICULTY_LABELS[session.difficulty] },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
      <Link
        href="/student/practice"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-500 transition hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        All practice sets
      </Link>

      {/* Header card */}
      <section className="relative overflow-hidden rounded-3xl bg-zinc-900 p-6 text-white sm:p-8">
        <svg aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-72 w-72" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="49" fill="none" stroke="#ffffff" strokeOpacity="0.07" />
        </svg>
        <svg aria-hidden="true" className="pointer-events-none absolute right-24 top-10 h-40 w-40" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="49" fill="none" stroke="#ffffff" strokeOpacity="0.05" />
        </svg>

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-4">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">
                <span className="h-[7px] w-[7px] rounded-full bg-red-600" />
                AI Practice
              </p>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                aria-label="Delete practice set"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-700 text-zinc-400 transition hover:border-red-500 hover:text-red-400 disabled:opacity-50 lg:hidden"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-[30px]">{session.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
              {session.sourceKind === 'lesson' ? <BookOpen className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
              <span className="truncate">{sourceLabel}</span>
              <span>· Created {new Date(session.createdAt).toLocaleDateString()}</span>
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {inProgressAttempt ? (
                <button
                  type="button"
                  onClick={handleResume}
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-red-600 px-6 text-sm font-bold text-white transition hover:bg-red-700"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Resume attempt
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={starting || questions.length === 0}
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-red-600 px-6 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {starting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : completedAttempts.length === 0 ? (
                    <Play className="h-4 w-4 fill-current" />
                  ) : (
                    <RotateCw className="h-4 w-4" />
                  )}
                  {completedAttempts.length === 0 ? 'Start practice' : 'Retake'}
                </button>
              )}
              {bestAttempt && bestAttempt.maxScore ? (
                <span className="text-xs text-zinc-400">
                  Best so far:{' '}
                  <span className="font-bold text-white">
                    {Math.round(((bestAttempt.score ?? 0) / bestAttempt.maxScore) * 100)}%
                  </span>
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-end gap-3">
            <div className="grid flex-1 grid-cols-3 gap-2.5 lg:w-[420px] lg:flex-none">
              {stats.map((s) => (
                <div key={s.label} className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3.5">
                  <p className="text-[11px] text-zinc-400">{s.label}</p>
                  <p className="text-xl font-extrabold sm:text-2xl">{s.value}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              aria-label="Delete practice set"
              className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-700 text-zinc-400 transition hover:border-red-500 hover:text-red-400 disabled:opacity-50 lg:flex"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {session.sourceNote && (
        <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-bold">Note from the AI:</span> {session.sourceNote}
          </span>
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* Left: attempts */}
        <section className="space-y-3">
          <h2 className="text-[15px] font-extrabold text-zinc-900">
            {completedAttempts.length === 0 ? 'Your attempts' : `Your attempts (${completedAttempts.length})`}
          </h2>

          {completedAttempts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100">
                <Trophy className="h-5 w-5 text-zinc-500" />
              </span>
              <p className="text-sm font-bold text-zinc-900">No attempts yet</p>
              <p className="max-w-xs text-[13px] text-zinc-500">
                Your score and each attempt will show here. Retake it as many times as you like.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              {completedAttempts.map((a, idx) => {
                const pct =
                  a.score !== null && a.maxScore && a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0;
                const isBest = bestAttempt?.id === a.id;
                return (
                  <li key={a.id}>
                    <Link
                      href={`/student/practice/${session.id}/attempt/${a.id}`}
                      className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-zinc-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-zinc-900">
                            Attempt {completedAttempts.length - idx}
                          </span>
                          {isBest && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-bold text-white">
                              <Trophy className="h-3 w-3" />
                              Best
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {a.submittedAt && new Date(a.submittedAt).toLocaleString()} · {a.score}/{a.maxScore} pts
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-sm font-extrabold ${pctTone(pct)}`}>{pct}%</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Right: what's inside + how it works */}
        <aside className="space-y-5">
          {questions.length > 0 && (
            <section className="space-y-3.5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <h2 className="text-[15px] font-extrabold text-zinc-900">What&apos;s inside</h2>
              <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full">
                {kindStats.map(([kind, s], i) => (
                  <span key={kind} className={MIX_SHADES[i % MIX_SHADES.length]} style={{ flex: s.count }} />
                ))}
              </div>
              <ul className="space-y-2.5">
                {kindStats.map(([kind, s], i) => (
                  <li key={kind} className="flex items-center gap-2.5 text-[13px] text-zinc-600">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${MIX_SHADES[i % MIX_SHADES.length]}`} />
                    <span className="min-w-0 flex-1">
                      <b className="font-extrabold text-zinc-900">{s.count}</b>{' '}
                      {PRACTICE_QUESTION_KIND_LABELS[kind as keyof typeof PRACTICE_QUESTION_KIND_LABELS]}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">
                      {s.points} pt{s.points === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
               {kindStats.some(([kind]) => kind === 'mc_multi') && (
                <p className="border-t border-zinc-100 pt-3 text-xs text-zinc-500">
                  {PRACTICE_QUESTION_KIND_LABELS.mc_multi} questions are worth 2 points each because they have more than
                  one correct answer.
                </p>
              )}
            </section>
          )}

          <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h2 className="text-[15px] font-extrabold text-zinc-900">How it works</h2>
            <ol className="space-y-2.5 text-[13px] text-zinc-600">
              {[
                'Answer the questions at your own pace. You can go back and change answers.',
                'Finish to see your score, the correct answers and why.',
                'Retake anytime. Every attempt is saved here so you can track your progress.',
              ].map((t, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}