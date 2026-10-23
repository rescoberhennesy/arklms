'use client';

import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  Award,
  Loader2,
  Pencil,
  ArrowRight,
  HelpCircle,
  AlarmClock,
  Hourglass,
} from 'lucide-react';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import type { ActivityWithStudentState } from '@/lib/types/activities';
import type { StudentAttemptView } from '@/lib/types/quizzes';
import type { StudentReviewView } from '@/lib/actions/quizzes';
import type {
  McSingleConfig,
  McMultiConfig,
  TrueFalseConfig,
  ShortAnswerConfig,
  MatchingConfig,
  McSingleAnswer,
  McMultiAnswer,
  TrueFalseAnswer,
  ShortAnswerAnswer,
  EssayAnswer,
  MatchingAnswer,
} from '@/lib/types/quizzes';

interface QuizPostSubmitProps {
  classId: string;
  activity: ActivityWithStudentState;
  attemptView: StudentAttemptView;
  reviewView: StudentReviewView | null;
  reviewLoading: boolean;
  autoSubmitted: boolean;
}

export default function QuizPostSubmit({
  classId,
  activity,
  attemptView,
  reviewView,
  reviewLoading,
  autoSubmitted,
}: QuizPostSubmitProps) {
  const showCorrect = attemptView.config.showCorrectAnswers;
  const submitted = attemptView.attempt.submittedAt !== null;

  const maxScore = reviewView
    ? reviewView.maxScore
    : attemptView.config.quizTotalPoints ?? activity.maxPoints;

  const submittedAt = attemptView.attempt.submittedAt
    ? new Date(attemptView.attempt.submittedAt).toLocaleString()
    : null;
  const submittedAtTime = attemptView.attempt.submittedAt
    ? new Date(attemptView.attempt.submittedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const canRenderReview = showCorrect && reviewView !== null;

  const responseFor = (questionId: string) =>
    attemptView.responses.find((x) => x.questionId === questionId);

  // Essays the student answered that the teacher hasn't scored yet.
  // (Unanswered essays simply count 0, same rule as the database.)
  const pendingEssays = submitted
    ? attemptView.questions.filter((q) => {
        if (q.questionKind !== 'essay') return false;
        const r = responseFor(q.id);
        return !!r && r.manualPoints === null;
      })
    : [];
  const pendingCount = pendingEssays.length;
  const pendingPoints = pendingEssays.reduce((s, q) => s + q.points, 0);
  const hasManualPending = pendingCount > 0;
  const pendingIds = new Set(pendingEssays.map((q) => q.id));

  // Points already decided (auto-graded items + essays the teacher scored).
  const gradedSoFar = attemptView.questions.reduce((s, q) => {
    if (pendingIds.has(q.id)) return s;
    const r = responseFor(q.id);
    return s + (r ? r.manualPoints ?? r.autoPoints ?? 0 : 0);
  }, 0);
  const gradedSoFarMax = maxScore - pendingPoints;

  // The final score is only shown once the grade is released. Students can
  // only read released grades, so activity.grade is null until then.
  const releasedScore = activity.grade ? activity.grade.score : null;
  const percentage =
    releasedScore !== null && maxScore > 0
      ? Math.round((releasedScore / maxScore) * 100)
      : null;

  return (
    <div className="space-y-4">
      {autoSubmitted && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlarmClock className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">
                Time&apos;s up
                {submittedAtTime ? ` — auto-submitted at ${submittedAtTime}` : ''}
              </p>
              <p className="mt-0.5 text-amber-800">
                Whatever you had answered when the timer expired was saved
                and submitted. Unanswered questions counted as 0.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-green-200 bg-green-50 p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8 flex-shrink-0 text-green-600" />
          <div>
            <h2 className="text-lg font-semibold text-green-900">
              Quiz submitted
            </h2>
            {submittedAt && (
              <p className="text-xs text-green-700">{submittedAt}</p>
            )}
          </div>
        </div>

        {releasedScore !== null ? (
          <div className="mt-4 flex items-baseline gap-3">
            <Award className="h-5 w-5 text-green-700" />
            <span className="text-3xl font-bold text-green-900">{releasedScore}</span>
            <span className="text-lg text-green-700">/ {maxScore}</span>
            {percentage !== null && (
              <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-sm font-medium text-green-800">
                {percentage}%
              </span>
            )}
          </div>
        ) : hasManualPending ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <Hourglass className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
              <div className="text-sm text-amber-900">
                <p className="font-semibold">Waiting for your teacher to grade</p>
                <p className="mt-0.5 text-amber-800">
                  {pendingCount} essay question{pendingCount === 1 ? '' : 's'} (
                  {pendingPoints} pt{pendingPoints === 1 ? '' : 's'}) still{' '}
                  {pendingCount === 1 ? 'needs' : 'need'} to be graded. Your
                  final score will appear here once your teacher finishes.
                </p>
                {attemptView.config.autoReleaseGrade && (
                  <p className="mt-2 text-xs font-medium text-amber-900">
                    Graded so far: {gradedSoFar} / {gradedSoFarMax} pts
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-green-800">
            Your teacher will release your grade once they finish reviewing.
          </p>
        )}
      </div>

      {/* Overall feedback from the teacher (attempt-level). */}
      {attemptView.attempt.feedback.trim() !== '' && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
            Teacher feedback
          </p>
          <div className="text-sm text-blue-950">
            <MarkdownContent body={attemptView.attempt.feedback} />
          </div>
        </div>
      )}

      {showCorrect ? (
        reviewLoading ? (
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your answers…
          </div>
        ) : canRenderReview && reviewView ? (
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Question review
            </h2>
            <ul className="space-y-3">
              {reviewView.questions.map((q, i) => {
                const r = reviewView.responses.find((x) => x.questionId === q.id);
                return <ReviewRow key={q.id} index={i} question={q} response={r} />;
              })}
            </ul>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm italic text-gray-500">
            Detailed review unavailable.
          </div>
        )
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
          <div className="mb-1 inline-flex items-center gap-1.5 font-medium text-gray-700">
            <HelpCircle className="h-4 w-4" />
            Per-question review not available
          </div>
          <p>
            Your teacher hasn&apos;t enabled showing correct answers for this
            quiz.{' '}
            {releasedScore !== null
              ? 'Your overall score is shown above.'
              : 'Your overall score will appear above once it is released.'}
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Link
          href={`/student/classes/${classId}?tab=grades`}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          See all grades
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

interface ReviewRowProps {
  index: number;
  question: StudentReviewView['questions'][number];
  response: StudentReviewView['responses'][number] | undefined;
}

function ReviewRow({ index, question: q, response: r }: ReviewRowProps) {
  const earned =
    r?.manualPoints !== undefined && r?.manualPoints !== null
      ? r.manualPoints
      : (r?.autoPoints ?? 0);

  // Teacher changed the auto-checked score for this question.
  const adjusted = !!r && q.questionKind !== 'essay' && r.manualPoints !== null;
  const autoEarned = r?.autoPoints ?? 0;

  // Verdict follows the FINAL score, not just the auto-check.
  const verdict: 'correct' | 'partial' | 'incorrect' | 'manual' | 'unanswered' = (() => {
    if (!r) return 'unanswered';
    if (q.questionKind === 'essay' && r.manualPoints === null) return 'manual';
    if (q.questionKind === 'essay' || adjusted) {
      if (earned >= q.points) return 'correct';
      if (earned > 0) return 'partial';
      return 'incorrect';
    }
    if (r.autoCorrect === true) return 'correct';
    if (r.autoCorrect === false) return 'incorrect';
    return 'manual';
  })();

  return (
    <li className="rounded-md border border-gray-100 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex flex-wrap items-center gap-2 text-sm font-medium text-gray-700">
          <span className="text-xs text-gray-400">Q{index + 1}</span>
          {verdict === 'correct' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
              <CheckCircle2 className="h-3 w-3" />
              Correct
            </span>
          ) : verdict === 'partial' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Partly correct
            </span>
          ) : verdict === 'incorrect' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
              <XCircle className="h-3 w-3" />
              Incorrect
            </span>
          ) : verdict === 'manual' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
              Pending teacher review
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
              Unanswered
            </span>
          )}
          {adjusted && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800"
              title={`The automatic check gave ${autoEarned}/${q.points}. Your teacher changed it to ${earned}/${q.points}.`}
            >
              <Pencil className="h-3 w-3" />
              Adjusted by teacher
            </span>
          )}
        </span>
        <span className="text-xs text-gray-500">
          {adjusted && autoEarned !== earned && (
            <span className="mr-1 text-gray-400 line-through">{autoEarned}</span>
          )}
          {earned} / {q.points}
        </span>
      </div>

      {q.prompt.trim() && (
        <div className="mb-2 text-sm text-gray-700">
          <MarkdownContent body={q.prompt} />
        </div>
      )}

      <ReviewAnswerDetail question={q} response={r} />

      {adjusted && (
        <p className="mt-2 text-xs text-purple-800">
          Your teacher reviewed this answer and changed the score from {autoEarned} to {earned}.
        </p>
      )}

      {r?.feedback && r.feedback.trim() && (
        <div className="mt-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <p className="mb-0.5 font-medium">Teacher&apos;s note</p>
          <MarkdownContent body={r.feedback} />
        </div>
      )}
    </li>
  );
}
function ReviewAnswerDetail({
  question: q,
  response: r,
}: {
  question: StudentReviewView['questions'][number];
  response: StudentReviewView['responses'][number] | undefined;
}) {
  const yourBox = (content: React.ReactNode) => (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-2 text-sm">
      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Your answer
      </p>
      {content}
    </div>
  );
  const correctBox = (content: React.ReactNode) => (
    <div className="rounded-md border border-green-200 bg-green-50 p-2 text-sm">
      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-green-700">
        Correct answer
      </p>
      {content}
    </div>
  );

  if (!r) {
    return <div className="text-xs italic text-gray-500">No response recorded.</div>;
  }

  switch (q.questionKind) {
    case 'mc_single': {
      const cfg = q.config as McSingleConfig;
      const ans = r.answer as McSingleAnswer;
      return (
        <div className="grid gap-2 md:grid-cols-2">
          {yourBox(
            ans.selected >= 0 ? (
              <span>{cfg.options[ans.selected] ?? '(unknown)'}</span>
            ) : (
              <span className="italic text-gray-400">No answer</span>
            ),
          )}
          {correctBox(<span>{cfg.options[cfg.correct[0]]}</span>)}
        </div>
      );
    }
    case 'mc_multi': {
      const cfg = q.config as McMultiConfig;
      const ans = r.answer as McMultiAnswer;
      const yourLabels = (ans.selected ?? []).map((i) => cfg.options[i]).filter(Boolean);
      const correctLabels = cfg.correct.map((i) => cfg.options[i]).filter(Boolean);
      return (
        <div className="grid gap-2 md:grid-cols-2">
          {yourBox(
            yourLabels.length > 0 ? (
              <ul className="list-disc pl-5">
                {yourLabels.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            ) : (
              <span className="italic text-gray-400">No answer</span>
            ),
          )}
          {correctBox(
            <ul className="list-disc pl-5">
              {correctLabels.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>,
          )}
        </div>
      );
    }
    case 'true_false': {
      const cfg = q.config as TrueFalseConfig;
      const ans = r.answer as TrueFalseAnswer;
      return (
        <div className="grid gap-2 md:grid-cols-2">
          {yourBox(<span>{ans.selected ? 'True' : 'False'}</span>)}
          {correctBox(<span>{cfg.correct ? 'True' : 'False'}</span>)}
        </div>
      );
    }
    case 'short_answer': {
      const cfg = q.config as ShortAnswerConfig;
      const ans = r.answer as ShortAnswerAnswer;
      return (
        <div className="grid gap-2 md:grid-cols-2">
          {yourBox(
            ans.text.trim() ? (
              <span className="font-mono">{ans.text}</span>
            ) : (
              <span className="italic text-gray-400">No answer</span>
            ),
          )}
          {correctBox(
            <div>
              <p className="text-xs text-gray-500">Accepted answers:</p>
              <ul className="mt-0.5 list-disc pl-5">
                {cfg.acceptable.map((a, i) => (
                  <li key={i} className="font-mono">
                    {a}
                  </li>
                ))}
              </ul>
            </div>,
          )}
        </div>
      );
    }
    case 'essay': {
      const ans = r.answer as EssayAnswer;
      return (
        <div className="space-y-2">
          {yourBox(
            ans.text.trim() ? (
              <p className="whitespace-pre-wrap">{ans.text}</p>
            ) : (
              <span className="italic text-gray-400">No answer</span>
            ),
          )}
          <p className="text-xs italic text-gray-500">
            Essays are graded manually by your teacher.
          </p>
        </div>
      );
    }
    case 'matching': {
      const cfg = q.config as MatchingConfig;
      const ans = r.answer as MatchingAnswer;
      const yourMap = new Map<number, number>();
      for (const [l, ri] of ans.pairs) yourMap.set(l, ri);
      const correctMap = new Map<number, number>();
      for (const [l, ri] of cfg.pairs) correctMap.set(l, ri);
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="pb-1 pr-2">Item</th>
                <th className="pb-1 pr-2">Your match</th>
                <th className="pb-1">Correct match</th>
              </tr>
            </thead>
            <tbody>
              {cfg.left.map((leftItem, leftIdx) => {
                const yours = yourMap.get(leftIdx);
                const correct = correctMap.get(leftIdx);
                const isRight = yours === correct && yours !== undefined;
                return (
                  <tr key={leftIdx} className="border-b border-gray-100">
                    <td className="py-1 pr-2 text-gray-700">{leftItem}</td>
                    <td
                      className={`py-1 pr-2 ${
                        isRight ? 'text-green-700' : 'text-gray-700'
                      }`}
                    >
                      {yours !== undefined ? cfg.right[yours] : '(no match)'}
                    </td>
                    <td className="py-1 text-green-700">
                      {correct !== undefined ? cfg.right[correct] : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }
  }
}