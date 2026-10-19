// src/components/student/PracticeResultsView.tsx
'use client';

import Link from 'next/link';
import { ArrowLeft, Check, X, RotateCw, Sparkles, Lightbulb } from 'lucide-react';
import type { PracticeAttempt, PracticeQuestion, PracticeSession } from '@/lib/types/practice';
import { PRACTICE_QUESTION_KIND_LABELS } from '@/lib/types/practice';

interface Props {
  session: PracticeSession;
  questions: PracticeQuestion[];
  attempt: PracticeAttempt;
}

// Render the student's submitted answer in a readable form per kind.
function formatStudentAnswer(q: PracticeQuestion, answer: unknown): string {
  if (!answer || typeof answer !== 'object') return '—';
  switch (q.questionKind) {
    case 'mc_single': {
      const a = answer as { selected: number };
      const options = (q.config as { options: string[] }).options;
      if (typeof a.selected !== 'number' || a.selected < 0 || a.selected >= options.length) return '(no answer)';
      return options[a.selected];
    }
    case 'mc_multi': {
      const a = answer as { selected: number[] };
      const options = (q.config as { options: string[] }).options;
      if (!Array.isArray(a.selected) || a.selected.length === 0) return '(no answer)';
      return a.selected
        .filter((i) => i >= 0 && i < options.length)
        .map((i) => options[i])
        .join(', ');
    }
    case 'true_false': {
      const a = answer as { selected: boolean | null };
      if (typeof a.selected !== 'boolean') return '(no answer)';
      return a.selected ? 'True' : 'False';
    }
    case 'short_answer': {
      const a = answer as { text: string };
      if (!a.text || !a.text.trim()) return '(no answer)';
      return a.text;
    }
  }
}

function formatCorrectAnswer(q: PracticeQuestion): string {
  switch (q.questionKind) {
    case 'mc_single': {
      const c = q.config as { options: string[]; correct: number[] };
      return c.options[c.correct[0]] ?? '—';
    }
    case 'mc_multi': {
      const c = q.config as { options: string[]; correct: number[] };
      return c.correct
        .map((i) => c.options[i])
        .filter(Boolean)
        .join(', ');
    }
    case 'true_false': {
      const c = q.config as { correct: boolean };
      return c.correct ? 'True' : 'False';
    }
    case 'short_answer': {
      const c = q.config as { acceptable: string[] };
      return c.acceptable.join(' / ');
    }
  }
}

export default function PracticeResultsView({ session, questions, attempt }: Props) {
  const pct =
    attempt.score !== null && attempt.maxScore && attempt.maxScore > 0
      ? Math.round((attempt.score / attempt.maxScore) * 100)
      : 0;

  const responsesByQ = new Map(attempt.responses.map((r) => [r.questionId, r]));
  const correctCount = attempt.responses.filter((r) => r.correct).length;
  const wrongCount = questions.length - correctCount;

  const tone =
    pct >= 80
      ? { ring: '#10b981', text: 'text-emerald-400', msg: 'Great work!' }
      : pct >= 50
        ? { ring: '#f59e0b', text: 'text-amber-400', msg: 'Good effort. Review the ones you missed.' }
        : { ring: '#ef4444', text: 'text-red-400', msg: 'Keep going. The explanations below will help.' };

  // Score ring geometry
  const R = 42;
  const C = 2 * Math.PI * R;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
      <Link
        href={`/student/practice/${session.id}`}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-500 transition hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to practice set
      </Link>

      {/* Score card */}
      <section className="relative overflow-hidden rounded-3xl bg-zinc-900 p-6 text-white sm:p-8">
        <svg aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-72 w-72" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="49" fill="none" stroke="#ffffff" strokeOpacity="0.07" />
        </svg>

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="relative h-32 w-32 shrink-0">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
              <circle cx="50" cy="50" r={R} fill="none" stroke="#27272a" strokeWidth="9" />
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={tone.ring}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C - (C * pct) / 100}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[30px] font-extrabold">{pct}%</span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">{session.title}</p>
            <p className={`mt-1.5 text-2xl font-extrabold ${tone.text}`}>{tone.msg}</p>
            <p className="mt-1 text-sm text-zinc-300">
              {attempt.score}/{attempt.maxScore} points
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={`/student/practice/${session.id}`}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white transition hover:bg-red-700"
              >
                <RotateCw className="h-4 w-4" />
                Retake
              </Link>
              <Link
                href="/student/practice"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-700 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                <Sparkles className="h-4 w-4" />
                All practice sets
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:w-[260px]">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3.5">
              <p className="text-[11px] text-zinc-400">Correct</p>
              <p className="text-2xl font-extrabold text-emerald-400">{correctCount}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3.5">
              <p className="text-[11px] text-zinc-400">Missed</p>
              <p className="text-2xl font-extrabold text-red-400">{wrongCount}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Review */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-extrabold text-zinc-900">Review your answers</h2>

        <ul className="grid gap-3 lg:grid-cols-2">
          {questions.map((q, idx) => {
            const r = responsesByQ.get(q.id);
            const correct = r?.correct ?? false;
            const studentAnswerText = formatStudentAnswer(q, r?.answer);
            const correctAnswerText = formatCorrectAnswer(q);

            return (
              <li
                key={q.id}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-start gap-3.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}
                    aria-label={correct ? 'Correct' : 'Incorrect'}
                  >
                    {correct ? <Check className="h-4 w-4" strokeWidth={3} /> : <X className="h-4 w-4" strokeWidth={3} />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-bold text-zinc-500">Q{idx + 1}</span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-700">
                        {PRACTICE_QUESTION_KIND_LABELS[q.questionKind]}
                      </span>
                      <span className="text-zinc-500">
                        {r?.points ?? 0}/{q.points} pts
                      </span>
                    </div>
                    <p className="text-[15px] font-semibold leading-snug text-zinc-900">{q.prompt}</p>

                    <div className="mt-3 grid gap-2 xl:grid-cols-2">
                      <div
                        className={`rounded-xl border px-3 py-2 ${
                          correct ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
                        }`}
                      >
                        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Your answer</p>
                        <p className={`text-sm font-medium ${correct ? 'text-emerald-800' : 'text-red-800'}`}>
                          {studentAnswerText}
                        </p>
                      </div>
                      {!correct && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Correct answer</p>
                          <p className="text-sm font-medium text-emerald-800">{correctAnswerText}</p>
                        </div>
                      )}
                    </div>

                    {q.explanation && (
                      <div className="mt-3 flex items-start gap-2 rounded-xl bg-zinc-50 px-3 py-2.5 text-[13px] leading-relaxed text-zinc-700">
                        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                        <span>
                          <span className="font-bold text-zinc-900">Why: </span>
                          {q.explanation}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}