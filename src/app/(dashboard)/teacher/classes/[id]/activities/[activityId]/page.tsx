// src/app/(dashboard)/teacher/classes/[id]/activities/[activityId]/page.tsx
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import {
  getActivityForTeacher,
  listActivityAttachments,
} from '@/lib/actions/activities';
import { getClassById } from '@/lib/actions/classes';
import {
  getTeacherQuizView,
  listQuizAttemptsForQuiz,
} from '@/lib/actions/quizzes';
import SetPageTitle from '@/components/dashboard/SetPageTitle';
import ActivityEditor from '@/components/teacher/ActivityEditor';
import QuizEditor from '@/components/teacher/QuizEditor';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string; activityId: string }>;
}

export default async function ActivityDetailPage({ params }: PageProps) {
  const { id: classId, activityId } = await params;
  if (!UUID_RE.test(classId) || !UUID_RE.test(activityId)) notFound();

  const classRes = await getClassById(classId);
  if (!classRes.ok || !classRes.data) notFound();
  const klass = classRes.data;

  let activity: Awaited<ReturnType<typeof getActivityForTeacher>>;
  try {
    activity = await getActivityForTeacher(activityId);
  } catch {
    notFound();
  }

  if (activity.classId !== classId) {
    redirect(`/teacher/classes/${activity.classId}/activities/${activityId}`);
  }

  const isQuiz = activity.activityKind === 'quiz';

  // Quiz branch: fetch view + attempts list in parallel (both are needed by
  // QuizEditor — view drives the editor body, attempts drive the new
  // QuizAttemptsPanel rendered between Questions and Danger zone).
  const [quizView, quizAttempts] = isQuiz
    ? await Promise.all([
        getTeacherQuizView(activityId),
        listQuizAttemptsForQuiz(activityId),
      ])
    : [null, []];

  // Assignment branch: attachments only.
  const attachments = !isQuiz ? await listActivityAttachments(activityId) : [];

  return (
    <div className="space-y-6">
      <SetPageTitle title={`${activity.title} — ${klass.name}`} />
      <Link
        href={`/teacher/classes/${classId}?tab=activities`}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft size={16} />
        Back to activities
      </Link>

      {isQuiz && quizView ? (
        <QuizEditor
          activity={activity}
          classId={classId}
          initialQuizView={quizView}
          initialAttempts={quizAttempts}
        />
      ) : (
        <ActivityEditor
          activity={activity}
          classId={classId}
          initialAttachments={attachments}
        />
      )}
    </div>
  );
}