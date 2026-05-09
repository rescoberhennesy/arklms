'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Send,
  CheckCircle2,
  Circle,
  Award,
} from 'lucide-react';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import {
  upsertQuizResponse,
  submitQuizAttempt,
} from '@/lib/actions/quizzes';
import {
  type StudentAttemptView,
  type StudentQuestionView,
  type QuestionAnswer,
  type SanitizedMcConfig,
  type SanitizedMatchingConfig,
  type McSingleAnswer,
  type McMultiAnswer,
  type TrueFalseAnswer,
  type ShortAnswerAnswer,
  type EssayAnswer,
  type MatchingAnswer,
  defaultAnswerFor,
} from '@/lib/types/quizzes';
import McSingleQuestion from  '@/components/student/quiz-questions/McSingleQuestion';
import McMultiQuestion from '@/components/student/quiz-questions/McMultiQuestion';
import TrueFalseQuestion from '@/components/student/quiz-questions/TrueFalseQuestion';
import ShortAnswerQuestion from '@/components/student/quiz-questions/ShortAnswerQuestion';
import EssayQuestion from '@/components/student/quiz-questions/EssayQuestion';
import MatchingQuestion from '@/components/student/quiz-questions/MatchingQuestion';

interface QuizAttemptProps {
  attemptView: StudentAttemptView;
  onSubmitted: () => Promise<void> | void;
  onError: (msg: string | null) => void;
}

// Per-question "answered" check. Used both by sidebar indicators and by
// the submit-block guard. Mirrors the student's mental model of
// "I picked something" vs "I haven't touched this".
function isAnswered(
  q: StudentQuestionView,
  answer: QuestionAnswer | undefined,
): boolean {
  if (!answer) return false;
  switch (q.questionKind) {
    case 'mc_single': {
      const a = answer as McSingleAnswer;
      return a.selected !== undefined && a.selected >= 0;
    }
    case 'mc_multi': {
      const a = answer as McMultiAnswer;
      return Array.isArray(a.selected) && a.selected.length > 0;
    }
    case 'true_false': {
      // We treat the absence of an explicit pick as unanswered. The default
      // answer is `selected: false`, which is indistinguishable from a
      // legitimate False pick. To resolve, we track "has the student
      // touched this question" via a separate Set held in state, and
      // gate isAnswered() on that. See `touchedQuestions` below.
      // Here we return true if a response row exists with selected as
      // a real boolean — which it always does once touched.
      return typeof (answer as TrueFalseAnswer).selected === 'boolean';
    }
    case 'short_answer': {
      const a = answer as ShortAnswerAnswer;
      return typeof a.text === 'string' && a.text.trim().length > 0;
    }
    case 'essay': {
      const a = answer as EssayAnswer;
      return typeof a.text === 'string' && a.text.trim().length > 0;
    }
    case 'matching': {
      const a = answer as MatchingAnswer;
      // Need a pair for every left item
      return (
        Array.isArray(a.pairs) &&
        a.pairs.length === ((q.config as SanitizedMatchingConfig).left?.length ?? 0)
      );
    }
  }
}

export default function QuizAttempt({
  attemptView,
  onSubmitted,
  onError,
}: QuizAttemptProps) {
  const { questions, responses, attempt } = attemptView;

  // Build initial answer map: questionId → answer
  const initialAnswers: Record<string, QuestionAnswer> = {};
  for (const q of questions) {
    const r = responses.find((x) => x.questionId === q.id);
    initialAnswers[q.id] = r ? r.answer : defaultAnswerFor(q.questionKind);
  }

  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>(
    initialAnswers,
  );

  // Track which questions the student has interacted with — needed because
  // true_false has no "neutral" answer (boolean has no third state).
  const initialTouched = new Set<string>();
  for (const r of responses) initialTouched.add(r.questionId);
  const [touchedQuestions, setTouchedQuestions] =
    useState<Set<string>>(initialTouched);

  // Per-question save status
  const [savingFor, setSavingFor] = useState<Set<string>>(new Set());
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Active question
  const [activeIdx, setActiveIdx] = useState(0);
  const activeQ = questions[activeIdx];

  // Submit state
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [isSubmitting, startSubmitTransition] = useTransition();

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const t of Object.values(debounceTimers.current)) clearTimeout(t);
    };
  }, []);

  function answeredFor(q: StudentQuestionView): boolean {
    if (!touchedQuestions.has(q.id)) return false;
    return isAnswered(q, answers[q.id]);
  }

  const allAnswered = questions.every((q) => answeredFor(q));
  const answeredCount = questions.filter((q) => answeredFor(q)).length;

  function handleAnswerChange(questionId: string, answer: QuestionAnswer) {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    setTouchedQuestions((prev) => {
      if (prev.has(questionId)) return prev;
      const next = new Set(prev);
      next.add(questionId);
      return next;
    });

    // Debounce save: 500ms after the last change for this question.
    const existing = debounceTimers.current[questionId];
    if (existing) clearTimeout(existing);
    debounceTimers.current[questionId] = setTimeout(() => {
      saveAnswer(questionId, answer);
    }, 500);
  }

  async function saveAnswer(questionId: string, answer: QuestionAnswer) {
    setSavingFor((prev) => {
      const next = new Set(prev);
      next.add(questionId);
      return next;
    });
    try {
      await upsertQuizResponse({
        attemptId: attempt.id,
        questionId,
        answer,
      });
      setSavedAt((prev) => ({ ...prev, [questionId]: Date.now() }));
    } catch (e) {
      onError(
        e instanceof Error
          ? `Failed to save answer: ${e.message}`
          : 'Failed to save answer.',
      );
    } finally {
      setSavingFor((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    }
  }

  // Make sure any pending debounced save for THIS question fires immediately
  // before we navigate away — otherwise switching questions fast could leave
  // the last keystroke unsaved.
  function flushPendingSave(questionId: string) {
    const t = debounceTimers.current[questionId];
    if (!t) return;
    clearTimeout(t);
    delete debounceTimers.current[questionId];
    const answer = answers[questionId];
    if (answer) void saveAnswer(questionId, answer);
  }

  function goPrev() {
    if (activeQ) flushPendingSave(activeQ.id);
    setActiveIdx((i) => Math.max(0, i - 1));
  }

  function goNext() {
    if (activeQ) flushPendingSave(activeQ.id);
    setActiveIdx((i) => Math.min(questions.length - 1, i + 1));
  }

  function jumpTo(i: number) {
    if (activeQ) flushPendingSave(activeQ.id);
    setActiveIdx(i);
  }

  function handleSubmitClick() {
    onError(null);
    if (!allAnswered) {
      onError(
        `You have ${questions.length - answeredCount} unanswered question${
          questions.length - answeredCount === 1 ? '' : 's'
        }. Answer them before submitting.`,
      );
      return;
    }
    setConfirmSubmit(true);
  }

  async function handleConfirmSubmit() {
    onError(null);
    // Ensure all in-flight debounced saves are flushed before submission
    for (const q of questions) flushPendingSave(q.id);

    startSubmitTransition(async () => {
      try {
        await submitQuizAttempt(attempt.id);
        await onSubmitted();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to submit.');
      }
    });
  }

  // Render the right per-kind question
  function renderQuestion(q: StudentQuestionView) {
    const answer = answers[q.id];
    switch (q.questionKind) {
      case 'mc_single':
        return (
          <McSingleQuestion
            options={(q.config as SanitizedMcConfig).options}
            answer={answer as McSingleAnswer}
            onChange={(a) => handleAnswerChange(q.id, a)}
            disabled={isSubmitting}
          />
        );
      case 'mc_multi':
        return (
          <McMultiQuestion
            options={(q.config as SanitizedMcConfig).options}
            answer={answer as McMultiAnswer}
            onChange={(a) => handleAnswerChange(q.id, a)}
            disabled={isSubmitting}
          />
        );
      case 'true_false':
        return (
          <TrueFalseQuestion
            answer={answer as TrueFalseAnswer}
            touched={touchedQuestions.has(q.id)}
            onChange={(a) => handleAnswerChange(q.id, a)}
            disabled={isSubmitting}
          />
        );
      case 'short_answer':
        return (
          <ShortAnswerQuestion
            answer={answer as ShortAnswerAnswer}
            onChange={(a) => handleAnswerChange(q.id, a)}
            disabled={isSubmitting}
          />
        );
      case 'essay':
        return (
          <EssayQuestion
            answer={answer as EssayAnswer}
            onChange={(a) => handleAnswerChange(q.id, a)}
            disabled={isSubmitting}
          />
        );
      case 'matching':
        return (
          <MatchingQuestion
            left={(q.config as SanitizedMatchingConfig).left}
            right={(q.config as SanitizedMatchingConfig).right}
            answer={answer as MatchingAnswer}
            onChange={(a) => handleAnswerChange(q.id, a)}
            disabled={isSubmitting}
          />
        );
    }
  }

  if (questions.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
        This quiz has no questions yet.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[200px_1fr]">
      {/* Sidebar */}
      <aside className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm md:sticky md:top-4 md:self-start">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Questions
        </div>
        <ul className="space-y-1">
          {questions.map((q, i) => {
            const ans = answeredFor(q);
            const isActive = i === activeIdx;
            return (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => jumpTo(i)}
                  disabled={isSubmitting}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                    isActive
                      ? 'bg-red-50 font-medium text-red-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  } disabled:opacity-50`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {ans ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-gray-300" />
                    )}
                    Q{i + 1}
                  </span>
                  <span className="text-xs text-gray-400">
                    {q.points} pt{q.points === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-600">
          <div>
            {answeredCount} of {questions.length} answered
          </div>
        </div>
      </aside>

      {/* Question pane */}
      <main className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        {activeQ && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Question {activeIdx + 1} of {questions.length}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                <Award className="h-3.5 w-3.5" />
                {activeQ.points} pt{activeQ.points === 1 ? '' : 's'}
              </span>
            </div>

            <div className="mb-4">
              {activeQ.prompt.trim() ? (
                <MarkdownContent body={activeQ.prompt} />
              ) : (
                <p className="italic text-gray-400">No prompt</p>
              )}
            </div>

            <div>{renderQuestion(activeQ)}</div>

            {/* Save indicator */}
            <div className="mt-3 h-4 text-xs text-gray-400">
              {savingFor.has(activeQ.id) ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving…
                </span>
              ) : savedAt[activeQ.id] ? (
                <span>Saved</span>
              ) : null}
            </div>

            {/* Nav */}
            <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={goPrev}
                disabled={activeIdx === 0 || isSubmitting}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>

              {activeIdx < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmitClick}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Submit quiz
                </button>
              )}
            </div>
          </>
        )}
      </main>

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit your quiz?"
        message={`You've answered all ${questions.length} questions. Once submitted, you can't change your answers.`}
        confirmLabel="Submit"
        onConfirm={handleConfirmSubmit}
        onClose={() => setConfirmSubmit(false)}
      />
    </div>
  );
}