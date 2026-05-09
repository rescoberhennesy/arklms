import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import {
  getActivityForTeacher,
  getSubmissionForTeacher,
} from '@/lib/actions/activities';
import { getClassById } from '@/lib/actions/classes';
import SetPageTitle from '@/components/dashboard/SetPageTitle';
import SubmissionGrader from '@/components/teacher/SubmissionGrader';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string; activityId: string; submissionId: string }>;
}

export default async function SubmissionGradingPage({ params }: PageProps) {
  const { id: classId, activityId, submissionId } = await params;

  if (
    !UUID_RE.test(classId) ||
    !UUID_RE.test(activityId) ||
    !UUID_RE.test(submissionId)
  ) {
    notFound();
  }

  const classRes = await getClassById(classId);
  if (!classRes.ok || !classRes.data) notFound();
  const klass = classRes.data;

  let activity: Awaited<ReturnType<typeof getActivityForTeacher>>;
  try {
    activity = await getActivityForTeacher(activityId);
  } catch {
    notFound();
  }

  // URL classId must match activity's actual class_id.
  if (activity.classId !== classId) {
    redirect(
      `/teacher/classes/${activity.classId}/activities/${activityId}/submissions/${submissionId}`,
    );
  }

  let submission: Awaited<ReturnType<typeof getSubmissionForTeacher>>;
  try {
    submission = await getSubmissionForTeacher(submissionId);
  } catch {
    notFound();
  }

  // Submission must belong to this activity.
  if (submission.activityId !== activityId) notFound();

  return (
    <div className="space-y-6">
      <SetPageTitle
        title={`${submission.studentName || submission.studentEmail} — ${activity.title}`}
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

      <SubmissionGrader
        submission={submission}
        activity={activity}
        classId={classId}
      />
    </div>
  );
}