import { listMyClasses } from '@/lib/actions/classes';
import ClassesView from '@/components/teacher/ClassesView';

export const dynamic = 'force-dynamic';

export default async function TeacherClassesPage() {
  const result = await listMyClasses();

  if (!result.ok) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Could not load classes: {result.error}
      </div>
    );
  }

  return <ClassesView initialClasses={result.data} />;
}