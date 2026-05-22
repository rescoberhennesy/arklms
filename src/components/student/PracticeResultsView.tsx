// src/components/student/PracticeResultsView.tsx
'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  X,
  Trophy,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import type {
  PracticeAttempt,
  PracticeQuestion,
  PracticeSession,
} from '@/lib/types/practice';
import { PRACTICE_QUESTION_KIND_LABELS } from '@/lib/types/practice';

interface Props {
  session: PracticeSession;
  questions: PracticeQuestion[];
  attempt: PracticeAttempt;
}

// Render the student's submitted answer in a readable form per kind.
function formatStudentAnswer(
  q: PracticeQuestion,
  answer: unknown,
): string {
  if (!answer || typeof answer !== 'object') return '—';

  switch (q.questionKind) {
    case 'mc_single': {
      const a = answer as { selected: number };
      const options = (q.config as { options: string[] }).options;
      if (typeof a.selected !== 'number' || a.selected < 0 || a.selected >= options.length) {
        return '(no answer)';
      }
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
      return c.correct.map((i) => c.options[i]).filter(Boolean).join(', ');
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

  // Map responses by questionId for quick lookup
  const responsesByQ = new Map(attempt.responses.map((r) => [r.questionId, r]));

  const scoreColor =
    pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600';
  const scoreBg =
    pct >= 80 ? 'bg-emerald-50 border-emerald-200' : pct >= 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

  const correctCount = attempt.responses.filter((r) => r.correct).length;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <Link
        href={`/student/practice/${session.id}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to session
      </Link>

      {/* Score card */}
      <div className={`rounded-xl border p-5 shadow-sm ${scoreBg}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              Your score
            </p>
            <p className={`text-4xl font-bold ${scoreColor}`}>{pct}%</p>
            <p className="mt-1 text-sm text-gray-600">
              {correctCount} of {questions.length} correct · {attempt.score}/{attempt.maxScore} points
            </p>
          </div>
          <Trophy className={`h-12 w-12 ${scoreColor}`} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/student/practice/${session.id}`}
            className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50"
          >
            <RotateCw className="h-4 w-4" />
            Retake
          </Link>
          <Link
            href="/student/practice"
            className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50"
          >
            <Sparkles className="h-4 w-4" />
            All sessions
          </Link>
        </div>
      </div>

      {/* Per-question review */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">
          Review
        </h2>

        <ul className="space-y-3">
          {questions.map((q, idx) => {
            const r = responsesByQ.get(q.id);
            const correct = r?.correct ?? false;
            const studentAnswerText = formatStudentAnswer(q, r?.answer);
            const correctAnswerText = formatCorrectAnswer(q);

            return (
              <li
                key={q.id}
                className={`rounded-xl border p-4 shadow-sm ${
                  correct ? 'border-emerald-200 bg-white' : 'border-red-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold text-gray-500">
                        Q{idx + 1}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                        {PRACTICE_QUESTION_KIND_LABELS[q.questionKind]}
                      </span>
                      <span className="text-[11px] text-gray-500">
                        {r?.points ?? 0}/{q.points} pts
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{q.prompt}</p>

                    <div className="mt-3 space-y-1.5 text-sm">
                      <div>
                        <span className="text-xs font-semibold text-gray-500">Your answer: </span>
                        <span className={correct ? 'text-emerald-700' : 'text-red-700'}>
                          {studentAnswerText}
                        </span>
                      </div>
                      {!correct && (
                        <div>
                          <span className="text-xs font-semibold text-gray-500">Correct answer: </span>
                          <span className="text-emerald-700">{correctAnswerText}</span>
                        </div>
                      )}
                    </div>

                    {q.explanation && (
                      <div className="mt-3 rounded-md bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                        <span className="font-semibold">Why: </span>
                        {q.explanation}
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