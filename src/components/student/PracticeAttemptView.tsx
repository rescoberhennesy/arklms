// src/components/student/PracticeAttemptView.tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Send, X, Loader2, AlertTriangle } from 'lucide-react';
import type {
  PracticeAttempt,
  PracticeQuestion,
  PracticeSession,
} from '@/lib/types/practice';
import { PRACTICE_QUESTION_KIND_LABELS } from '@/lib/types/practice';
import type { QuestionAnswer } from '@/lib/types/quizzes';
import {
  submitPracticeAttempt,
  abandonPracticeAttempt,
} from '@/lib/actions/practice';
import McSingleQuestion from '@/components/student/quiz-questions/McSingleQuestion';
import McMultiQuestion from '@/components/student/quiz-questions/McMultiQuestion';
import TrueFalseQuestion from '@/components/student/quiz-questions/TrueFalseQuestion';
import ShortAnswerQuestion from '@/components/student/quiz-questions/ShortAnswerQuestion';

interface Props {
  session: PracticeSession;
  questions: PracticeQuestion[];
  attempt: PracticeAttempt;
}

function emptyAnswer(kind: PracticeQuestion['questionKind']): QuestionAnswer {
  switch (kind) {
    case 'mc_single':
      return { selected: -1 } as unknown as QuestionAnswer;
    case 'mc_multi':
      return { selected: [] } as unknown as QuestionAnswer;
    case 'true_false':
      // TrueFalseAnswer requires `selected: boolean` (no null). We seed with
      // `false` but rely on the `touched` Set to track whether the student
      // has actually interacted. TrueFalseQuestion already handles this via
      // its `touched` prop: it only highlights a button when touched is true.
      return { selected: false } as unknown as QuestionAnswer;
    case 'short_answer':
      return { text: '' } as unknown as QuestionAnswer;
  }
}

function isAnswered(
  kind: PracticeQuestion['questionKind'],
  a: QuestionAnswer,
  touched: boolean,
): boolean {
  switch (kind) {
    case 'mc_single':
      return typeof (a as { selected: number }).selected === 'number' && (a as { selected: number }).selected >= 0;
    case 'mc_multi':
      return Array.isArray((a as { selected: number[] }).selected) && (a as { selected: number[] }).selected.length > 0;
    case 'true_false':
      // Default seed is `selected: false`, indistinguishable from a real
      // "False" pick. Use the touched flag as ground truth instead.
      return touched;
    case 'short_answer':
      return typeof (a as { text: string }).text === 'string' && (a as { text: string }).text.trim().length > 0;
  }
}

export default function PracticeAttemptView({ session, questions, attempt }: Props) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, QuestionAnswer>>(() => {
    const m = new Map<string, QuestionAnswer>();
    for (const q of questions) m.set(q.id, emptyAnswer(q.questionKind));
    return m;
  });
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = questions[index];
  const currentAnswer = answers.get(current.id) ?? emptyAnswer(current.questionKind);
// In the answeredCount useMemo:
const answeredCount = useMemo(() => {
    let n = 0;
    for (const q of questions) {
      const a = answers.get(q.id);
      if (a && isAnswered(q.questionKind, a, touched.has(q.id))) n++;
    }
    return n;
  }, [answers, questions, touched]);

  function updateAnswer(answer: QuestionAnswer) {
    setAnswers((prev) => {
      const next = new Map(prev);
      next.set(current.id, answer);
      return next;
    });
    setTouched((prev) => {
      if (prev.has(current.id)) return prev;
      const next = new Set(prev);
      next.add(current.id);
      return next;
    });
  }

  function goPrev() {
    if (index > 0) setIndex(index - 1);
  }
  function goNext() {
    if (index < questions.length - 1) setIndex(index + 1);
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await submitPracticeAttempt({
        attemptId: attempt.id,
        responses: questions.map((q) => ({
          questionId: q.id,
          answer: answers.get(q.id) ?? emptyAnswer(q.questionKind),
        })),
      });
      // Page will re-render via the server page, which routes to results.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed.');
      setSubmitting(false);
      setShowSubmitConfirm(false);
    }
  }

  async function handleAbandon() {
    try {
      await abandonPracticeAttempt(attempt.id);
      router.push(`/student/practice/${session.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to discard attempt');
    }
  }

  function renderQuestion() {
    switch (current.questionKind) {
      case 'mc_single':
        return (
          <McSingleQuestion
            options={(current.config as { options: string[] }).options}
            answer={currentAnswer as { selected: number }}
            onChange={updateAnswer as (a: { selected: number }) => void}
          />
        );
      case 'mc_multi':
        return (
          <McMultiQuestion
            options={(current.config as { options: string[] }).options}
            answer={currentAnswer as { selected: number[] }}
            onChange={updateAnswer as (a: { selected: number[] }) => void}
          />
        );
      case 'true_false':
        return (
          <TrueFalseQuestion
            answer={currentAnswer as { selected: boolean }}
            touched={touched.has(current.id)}
            onChange={updateAnswer as (a: { selected: boolean }) => void}
          />
        );
      case 'short_answer':
        return (
          <ShortAnswerQuestion
            answer={currentAnswer as { text: string }}
            onChange={updateAnswer as (a: { text: string }) => void}
          />
        );
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-gray-50 pb-20 sm:pb-0">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setShowAbandonConfirm(true)}
            className="inline-flex items-center gap-1 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Exit attempt"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-xs text-gray-500">{session.title}</p>
            <p className="text-sm font-semibold text-gray-900">
              {index + 1} of {questions.length}{' '}
              <span className="text-xs font-normal text-gray-400">
                · {answeredCount} answered
              </span>
            </p>
          </div>
          <div className="w-9" />
        </div>

        {/* Progress dots */}
        <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-4 pb-3">

          {questions.map((q, i) => {
  const a = answers.get(q.id);
  const isCurrent = i === index;
  const isAns = a ? isAnswered(q.questionKind, a, touched.has(q.id)) : false;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Question ${i + 1}`}
                className={`h-2 min-w-[1.25rem] flex-1 rounded-full transition ${
                  isCurrent
                    ? 'bg-red-600'
                    : isAns
                      ? 'bg-red-300'
                      : 'bg-gray-200 hover:bg-gray-300'
                }`}
              />
            );
          })}
        </div>
      </header>

      {/* Question */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
              {PRACTICE_QUESTION_KIND_LABELS[current.questionKind]}
            </span>
            <span className="text-[11px] text-gray-500">
              {current.points} pt{current.points === 1 ? '' : 's'}
            </span>
          </div>
          <p className="mb-5 text-base font-medium leading-relaxed text-gray-900">
            {current.prompt}
          </p>
          {renderQuestion()}
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </main>

      {/* Bottom action bar — sticky on mobile, inline on desktop */}
      <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white p-3 shadow-lg sm:static sm:shadow-none">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={index === 0}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </button>

          {index === questions.length - 1 ? (
            <button
              type="button"
              onClick={() => setShowSubmitConfirm(true)}
              disabled={submitting}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 sm:flex-none"
            >
              <Send className="h-4 w-4" />
              Submit
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 sm:flex-none"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </footer>

      {/* Submit confirm modal */}
      {showSubmitConfirm && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !submitting && setShowSubmitConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-semibold text-gray-900">Submit attempt?</h3>
            <p className="mt-2 text-sm text-gray-600">
              You've answered {answeredCount} of {questions.length} questions.
              {answeredCount < questions.length && (
                <>
                  {' '}
                  Unanswered questions will be marked as incorrect.
                </>
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                disabled={submitting}
                className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Keep working
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Abandon confirm modal */}
      {showAbandonConfirm && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowAbandonConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-semibold text-gray-900">Discard this attempt?</h3>
            <p className="mt-2 text-sm text-gray-600">
              Your answers won't be saved. The session stays — you can retake it anytime.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAbandonConfirm(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Keep going
              </button>
              <button
                type="button"
                onClick={handleAbandon}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}