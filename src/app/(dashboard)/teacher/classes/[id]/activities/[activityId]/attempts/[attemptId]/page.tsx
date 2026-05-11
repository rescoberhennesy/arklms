// src/app/(dashboard)/teacher/classes/[id]/activities/[activityId]/attempts/[attemptId]/page.tsx
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import {
  getActivityForTeacher,
} from '@/lib/actions/activities';
import { getClassById } from '@/lib/actions/classes';
import { getAttemptForGrading } from '@/lib/actions/quizzes';
import SetPageTitle from '@/components/dashboard/SetPageTitle';
import QuizAttemptGrader from '@/components/teacher/QuizAttemptGrader';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string; activityId: string; attemptId: string }>;
}

export default async function QuizAttemptGradingPage({ params }: PageProps) {
  const { id: classId, activityId, attemptId } = await params;

  if (
    !UUID_RE.test(classId) ||
    !UUID_RE.test(activityId) ||
    !UUID_RE.test(attemptId)
  ) {
    notFound();
  }

  const classRes = await getClassById(classId);
  if (!classRes.ok || !classRes.data) notFound();
  const klass = classRes.data;

  // Validate the activity is a quiz owned by this teacher and belongs to
  // this class. Mirrors the SubmissionGradingPage check.
  let activity: Awaited<ReturnType<typeof getActivityForTeacher>>;
  try {
    activity = await getActivityForTeacher(activityId);
  } catch {
    notFound();
  }

  if (activity.classId !== classId) {
    redirect(
      `/teacher/classes/${activity.classId}/activities/${activityId}/attempts/${attemptId}`,
    );
  }

  if (activity.activityKind !== 'quiz') {
    // Defensive: this route is quiz-only. Redirect assignment activities
    // back to their normal detail page.
    redirect(`/teacher/classes/${classId}/activities/${activityId}`);
  }

  // Fetch the full grading view. RLS / SECURITY DEFINER on the action
  // layer enforces teacher ownership; if it throws, treat as not-found.
  let view: Awaited<ReturnType<typeof getAttemptForGrading>>;
  try {
    view = await getAttemptForGrading(attemptId);
  } catch {
    notFound();
  }

  // Attempt must belong to this activity.
  if (view.activityId !== activityId) notFound();

  return (
    <div className="space-y-6">
      <SetPageTitle
        title={`${view.studentName || view.studentEmail || 'Attempt'} — ${activity.title}`}
      />

      <Link
        href={`/teacher/classes/${classId}/activities/${activityId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft size={16} />
        Back to {activity.title}
      </Link>

      <div className="text-xs text-gray-500">
        {klass.name}
        {klass.section ? ` · ${klass.section}` : ''}
      </div>

      <QuizAttemptGrader view={view} />
    </div>
  );
}