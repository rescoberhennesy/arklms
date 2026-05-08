import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getClassById } from '@/lib/actions/classes';
import { getModuleWithLessons } from '@/lib/actions/modules';
import SetPageTitle from '@/components/dashboard/SetPageTitle';
import ModuleEditor from '@/components/teacher/ModuleEditor';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string; moduleId: string }>;
}

export default async function TeacherModulePage({ params }: PageProps) {
  const { id: classId, moduleId } = await params;

  if (!UUID_RE.test(classId) || !UUID_RE.test(moduleId)) {
    redirect('/teacher/classes');
  }

  const classRes = await getClassById(classId);
  if (!classRes.ok || !classRes.data) notFound();

  let moduleData;
  try {
    moduleData = await getModuleWithLessons(moduleId);
  } catch {
    notFound();
  }

  // Sanity check: module belongs to this class.
  if (moduleData.class_id !== classId) notFound();

  return (
    <div className="space-y-6">
      <SetPageTitle title={moduleData.title} />
      <Link
        href={`/teacher/classes/${classId}?tab=modules`}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft size={16} />
        Back to {classRes.data.name}
      </Link>
      <ModuleEditor module={moduleData} classId={classId} />
    </div>
  );
}