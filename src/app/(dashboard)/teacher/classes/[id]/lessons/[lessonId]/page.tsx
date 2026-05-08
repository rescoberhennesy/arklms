import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getLesson } from '@/lib/actions/modules';
import { getClassById } from '@/lib/actions/classes';
import SetPageTitle from '@/components/dashboard/SetPageTitle';
import LessonEditor from '@/components/teacher/LessonEditor';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string; lessonId: string }>;
}

export default async function TeacherLessonPage({ params }: PageProps) {
  const { id: classId, lessonId } = await params;

  if (!UUID_RE.test(classId) || !UUID_RE.test(lessonId)) {
    redirect(`/teacher/classes`);
  }

  // Verify the teacher can access the class (RLS will also enforce this on the
  // lesson fetch, but a clean redirect beats a thrown error).
  const classRes = await getClassById(classId);
  if (!classRes.ok || !classRes.data) notFound();

  let lesson;
  try {
    lesson = await getLesson(lessonId);
  } catch {
    notFound();
  }

  // Sanity check: the lesson belongs to this class.
  if (lesson.class_id !== classId) notFound();

  return (
    <div className="space-y-6">
      <SetPageTitle title={lesson.title} />
      <Link
        href={`/teacher/classes/${classId}?tab=modules`}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft size={16} />
        Back to {classRes.data.name}
      </Link>
      <LessonEditor lesson={lesson} classId={classId} />
    </div>
  );
}