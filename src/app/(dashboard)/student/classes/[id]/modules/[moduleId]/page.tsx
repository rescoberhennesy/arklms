import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ChevronLeft, FileText, Tag } from 'lucide-react';
import { getStudentClassById } from '@/lib/actions/enrollments';
import { getModuleForStudent } from '@/lib/actions/modules';
import SetPageTitle from '@/components/dashboard/SetPageTitle';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import { MODULE_TERM_LABELS, type ModuleTerm } from '@/lib/types/modules';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TERM_ACCENTS: Record<ModuleTerm, string> = {
  prelim: 'border-blue-200 text-blue-800 bg-blue-50',
  midterm: 'border-purple-200 text-purple-800 bg-purple-50',
  prefinal: 'border-amber-200 text-amber-800 bg-amber-50',
  final: 'border-rose-200 text-rose-800 bg-rose-50',
};

interface PageProps {
  params: Promise<{ id: string; moduleId: string }>;
}

export default async function StudentModulePage({ params }: PageProps) {
  const { id: classId, moduleId } = await params;

  if (!UUID_RE.test(classId) || !UUID_RE.test(moduleId)) {
    redirect('/student/classes');
  }

  let klass;
  try {
    klass = await getStudentClassById(classId);
  } catch {
    redirect('/student/classes');
  }
  if (!klass) redirect('/student/classes');

  let moduleData;
  try {
    moduleData = await getModuleForStudent(moduleId);
  } catch {
    notFound();
  }
  if (moduleData.class_id !== classId) notFound();

  return (
    <div className="space-y-6">
      <SetPageTitle title={moduleData.title} />
      <Link
        href={`/student/classes/${classId}?tab=modules`}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft size={16} />
        Back to {klass.name}
      </Link>

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {moduleData.title}
          </h1>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${TERM_ACCENTS[moduleData.term]}`}
        >
          <Tag className="h-3 w-3" />
          {MODULE_TERM_LABELS[moduleData.term]}
        </span>
      </div>

      {moduleData.description.trim() && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            About this module
          </h2>
          <MarkdownContent body={moduleData.description} />
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Lessons
        </h2>
        {moduleData.lessons.length === 0 ? (
          <p className="text-sm italic text-gray-400">
            No lessons available yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {moduleData.lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link
                  href={`/student/classes/${classId}/lessons/${lesson.id}`}
                  className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50/50 px-3 py-2 hover:bg-gray-100/60"
                >
                  <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="flex-1 truncate text-sm text-gray-800">
                    {lesson.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}