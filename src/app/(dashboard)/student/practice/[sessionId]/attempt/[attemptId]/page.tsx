// src/app/(dashboard)/student/practice/[sessionId]/attempt/[attemptId]/page.tsx
import { notFound, redirect } from 'next/navigation';
import { getPracticeSession } from '@/lib/actions/practice';
import PracticeAttemptView from '@/components/student/PracticeAttemptView';
import PracticeResultsView from '@/components/student/PracticeResultsView';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ sessionId: string; attemptId: string }>;
}

export default async function PracticeAttemptPage({ params }: PageProps) {
  const { sessionId, attemptId } = await params;
  const detail = await getPracticeSession(sessionId);
  if (!detail) notFound();

  const attempt = detail.attempts.find((a) => a.id === attemptId);
  if (!attempt) notFound();

  // If submitted, show results view. Otherwise, show take-attempt view.
  if (attempt.submittedAt) {
    return (
      <PracticeResultsView
        session={detail.session}
        questions={detail.questions}
        attempt={attempt}
      />
    );
  }

  // Sanity: a session with zero questions shouldn't reach here.
  if (detail.questions.length === 0) {
    redirect(`/student/practice/${sessionId}`);
  }

  return (
    <PracticeAttemptView
      session={detail.session}
      questions={detail.questions}
      attempt={attempt}
    />
  );
}