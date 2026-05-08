import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getStudentClassById } from '@/lib/actions/enrollments';
import { getLesson } from '@/lib/actions/modules';
import SetPageTitle from '@/components/dashboard/SetPageTitle';
import StudentLessonView from '@/components/student/StudentLessonView';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string; lessonId: string }>;
}

export default async function StudentLessonPage({ params }: PageProps) {
  const { id: classId, lessonId } = await params;

  if (!UUID_RE.test(classId) || !UUID_RE.test(lessonId)) {
    redirect('/student/classes');
  }

  let klass;
  try {
    klass = await getStudentClassById(classId);
  } catch {
    redirect('/student/classes');
  }
  if (!klass) redirect('/student/classes');

  // RLS filters unpublished lessons for students, so this throws if the
  // student is trying to access an unpublished lesson directly.
  let lesson;
  try {
    lesson = await getLesson(lessonId);
  } catch {
    notFound();
  }
  if (lesson.class_id !== classId) notFound();

  return (
    <div className="space-y-6">
      <SetPageTitle title={lesson.title} />
      <Link
        href={`/student/classes/${classId}?tab=modules`}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft size={16} />
        Back to {klass.name}
      </Link>
      <StudentLessonView lesson={lesson} />
    </div>
  );
}