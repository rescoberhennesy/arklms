import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getActivityForStudent } from '@/lib/actions/activities';
import { getClassById } from '@/lib/actions/classes';
import { getStudentAttemptView } from '@/lib/actions/quizzes';
import SetPageTitle from '@/components/dashboard/SetPageTitle';
import StudentActivityView from '@/components/student/StudentActivityView';
import StudentQuizFlow from '@/components/student/StudentQuizFlow';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string; activityId: string }>;
}

export default async function StudentActivityPage({ params }: PageProps) {
  const { id: classId, activityId } = await params;

  if (!UUID_RE.test(classId) || !UUID_RE.test(activityId)) notFound();

  const classRes = await getClassById(classId);
  if (!classRes.ok || !classRes.data) notFound();
  const klass = classRes.data;

  let activity: Awaited<ReturnType<typeof getActivityForStudent>>;
  try {
    activity = await getActivityForStudent(activityId);
  } catch {
    notFound();
  }

  if (activity.classId !== classId) {
    redirect(`/student/classes/${activity.classId}/activities/${activityId}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const isQuiz = activity.activityKind === 'quiz';

  // For quiz activities, prefetch attempt view (may be null if not started).
  const initialAttemptView = isQuiz
    ? await getStudentAttemptView(activityId).catch(() => null)
    : null;

  return (
    <div className="space-y-6">
      <SetPageTitle title={`${activity.title} — ${klass.name}`} />
      <Link
        href={`/student/classes/${classId}?tab=activities`}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft size={16} />
        Back to activities
      </Link>

      {isQuiz ? (
        <StudentQuizFlow
          classId={classId}
          activity={activity}
          initialAttemptView={initialAttemptView}
        />
      ) : (
        <StudentActivityView
          classId={classId}
          activity={activity}
          currentUserId={user.id}
        />
      )}
    </div>
  );
}