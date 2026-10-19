// src/components/student/PracticeAttemptView.tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Send, X, Loader2, AlertTriangle } from 'lucide-react';
import type { PracticeAttempt, PracticeQuestion, PracticeSession } from '@/lib/types/practice';
import { PRACTICE_QUESTION_KIND_LABELS } from '@/lib/types/practice';
import type { QuestionAnswer } from '@/lib/types/quizzes';
import { submitPracticeAttempt, abandonPracticeAttempt } from '@/lib/actions/practice';
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
      // Seeded with false; the `touched` Set tracks whether the student actually picked.
      return { selected: false } as unknown as QuestionAnswer;
    case 'short_answer':
      return { text: '' } as unknown as QuestionAnswer;
  }
}

function isAnswered(kind: PracticeQuestion['questionKind'], a: QuestionAnswer, touched: boolean): boolean {
  switch (kind) {
    case 'mc_single':
      return typeof (a as { selected: number }).selected === 'number' && (a as { selected: number }).selected >= 0;
    case 'mc_multi':
      return Array.isArray((a as { selected: number[] }).selected) && (a as { selected: number[] }).selected.length > 0;
    case 'true_false':
      return touched;
    case 'short_answer':
      return typeof (a as { text: string }).text === 'string' && (a as { text: string }).text.trim().length > 0;
  }
}

const KIND_HINT: Record<PracticeQuestion['questionKind'], string> = {
  mc_single: 'Pick one',
  mc_multi: 'Pick all that apply',
  true_false: 'True or false',
  short_answer: 'Type your answer',
};

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
  const isLast = index === questions.length - 1;

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
      // Page re-renders via the server page, which routes to results.
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
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-[#faf8f7]">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3.5 px-4 pb-3 pt-3.5">
          <button
            type="button"
            onClick={() => setShowAbandonConfirm(true)}
            aria-label="Exit practice"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-zinc-500">{session.title}</p>
            <p className="text-[15px] font-extrabold text-zinc-900">
              Question {index + 1} of {questions.length}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1.5 text-[13px] font-bold text-zinc-700">
            {answeredCount}/{questions.length} answered
          </span>
        </div>

        {/* Progress segments: current = charcoal, answered = mid grey, unanswered = light */}
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-3.5">
          {questions.map((q, i) => {
            const a = answers.get(q.id);
            const isCurrent = i === index;
            const isAns = a ? isAnswered(q.questionKind, a, touched.has(q.id)) : false;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to question ${i + 1}${isAns ? ' (answered)' : ''}`}
                aria-current={isCurrent ? 'step' : undefined}
                className={`h-1.5 min-w-[1.25rem] flex-1 rounded-full transition ${
                  isCurrent ? 'bg-zinc-900' : isAns ? 'bg-zinc-400' : 'bg-zinc-200 hover:bg-zinc-300'
                }`}
              />
            );
          })}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          {/* Left: question + inline navigation */}
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-bold text-white">
                {PRACTICE_QUESTION_KIND_LABELS[current.questionKind]}
              </span>
              <span className="text-xs text-zinc-500">
                {current.points} pt{current.points === 1 ? '' : 's'} · {KIND_HINT[current.questionKind]}
              </span>
            </div>

            <h1 className="mb-6 text-[22px] font-extrabold leading-snug tracking-tight text-zinc-900 sm:text-[26px]">
              {current.prompt}
            </h1>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
              {renderQuestion()}
            </div>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="mt-6 flex items-center gap-3 border-t border-zinc-200 pt-5">
              <button
                type="button"
                onClick={goPrev}
                disabled={index === 0}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <span className="flex-1" />
              {isLast ? (
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(true)}
                  disabled={submitting}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  Finish &amp; see results
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-zinc-900 px-5 text-sm font-bold text-white transition hover:bg-zinc-800"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Right: question navigator */}
          <aside className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:sticky lg:top-36">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-extrabold text-zinc-900">Questions</h2>
              <span className="text-xs font-semibold text-zinc-500">
                {answeredCount}/{questions.length} answered
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, i) => {
                const a = answers.get(q.id);
                const isCurrent = i === index;
                const isAns = a ? isAnswered(q.questionKind, a, touched.has(q.id)) : false;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Question ${i + 1}${isAns ? ', answered' : ''}`}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`h-10 rounded-xl text-sm font-bold transition ${
                      isCurrent
                        ? 'bg-zinc-900 text-white ring-4 ring-zinc-900/10'
                        : isAns
                          ? 'bg-zinc-200 text-zinc-800 hover:bg-zinc-300'
                          : 'border border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-900'
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-zinc-900" />
                Current
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-zinc-200" />
                Answered
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px] border border-zinc-300" />
                Not yet
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowSubmitConfirm(true)}
              disabled={submitting}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              Finish &amp; see results
            </button>
          </aside>
        </div>
      </main>

      {/* Submit confirm */}
      {showSubmitConfirm && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !submitting && setShowSubmitConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]"
          >
            <h3 className="text-lg font-extrabold text-zinc-900">Finish this attempt?</h3>
            <p className="mt-2 text-sm text-zinc-600">
              You&apos;ve answered {answeredCount} of {questions.length} questions.
              {answeredCount < questions.length && ' Unanswered questions will be marked as incorrect.'}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                disabled={submitting}
                className="h-10 rounded-xl px-4 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100"
              >
                Keep working
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Finish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Abandon confirm */}
      {showAbandonConfirm && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowAbandonConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]"
          >
            <h3 className="text-lg font-extrabold text-zinc-900">Leave this attempt?</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Your answers won&apos;t be saved. The practice set stays, so you can retake it anytime.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAbandonConfirm(false)}
                className="h-10 rounded-xl px-4 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100"
              >
                Keep going
              </button>
              <button
                type="button"
                onClick={handleAbandon}
                className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-bold text-white transition hover:bg-zinc-800"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}