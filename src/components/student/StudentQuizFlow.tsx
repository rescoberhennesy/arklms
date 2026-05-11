'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  startQuizAttempt,
  getStudentAttemptView,
  getStudentReviewView,
  type StudentReviewView,
} from '@/lib/actions/quizzes';
import type { ActivityWithStudentState } from '@/lib/types/activities';
import type { StudentAttemptView } from '@/lib/types/quizzes';
import QuizLanding from '@/components/student/QuizLanding';
import QuizAttempt from '@/components/student/QuizAttempt';
import QuizPostSubmit from '@/components/student/QuizPostSubmit';

interface StudentQuizFlowProps {
  classId: string;
  activity: ActivityWithStudentState;
  initialAttemptView: StudentAttemptView | null;
}

export default function StudentQuizFlow({
  classId,
  activity,
  initialAttemptView,
}: StudentQuizFlowProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [attemptView, setAttemptView] = useState<StudentAttemptView | null>(
    initialAttemptView,
  );
  const [reviewView, setReviewView] = useState<StudentReviewView | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  const screen: 'landing' | 'attempt' | 'submitted' = (() => {
    if (!attemptView) return 'landing';
    if (attemptView.attempt.submittedAt) return 'submitted';
    return 'attempt';
  })();

  useEffect(() => {
    if (screen !== 'submitted' || !attemptView) return;
    if (!attemptView.config.showCorrectAnswers) return;
    if (reviewView) return;

    setReviewLoading(true);
    getStudentReviewView(activity.id)
      .then((v) => setReviewView(v))
      .catch((e) => {
        console.warn('Review view unavailable:', e);
      })
      .finally(() => setReviewLoading(false));
  }, [screen, attemptView, reviewView, activity.id]);

  function handleStartAttempt() {
    setError(null);
    startTransition(async () => {
      try {
        await startQuizAttempt(activity.id);
        const next = await getStudentAttemptView(activity.id);
        setAttemptView(next);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to start quiz.');
      }
    });
  }

  async function handleSubmitted(info: { autoSubmitted: boolean }) {
    try {
      setAutoSubmitted(info.autoSubmitted);
      const next = await getStudentAttemptView(activity.id);
      setAttemptView(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh.');
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {screen === 'landing' && (
        <QuizLanding
          activity={activity}
          onStart={handleStartAttempt}
          starting={isPending}
        />
      )}

      {screen === 'attempt' && attemptView && (
        <QuizAttempt
          attemptView={attemptView}
          onSubmitted={handleSubmitted}
          onError={setError}
        />
      )}

      {screen === 'submitted' && attemptView && (
        <QuizPostSubmit
          classId={classId}
          activity={activity}
          attemptView={attemptView}
          reviewView={reviewView}
          reviewLoading={reviewLoading}
          autoSubmitted={autoSubmitted}
        />
      )}
    </div>
  );
}