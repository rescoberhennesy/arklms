import { listAllTeachers } from '@/lib/actions/admin';
import AdminTeachersView from '@/components/admin/AdminTeachersView';

export const dynamic = 'force-dynamic';

export default async function AdminTeachersPage() {
  let teachers;
  try {
    teachers = await listAllTeachers();
  } catch (err) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load teachers:{' '}
        {err instanceof Error ? err.message : 'Unknown error'}
      </div>
    );
  }
  return <AdminTeachersView teachers={teachers} />;
}