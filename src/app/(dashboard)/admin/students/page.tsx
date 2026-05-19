import { listAllStudents } from '@/lib/actions/admin';
import AdminStudentsView from '@/components/admin/AdminStudentsView';

export const dynamic = 'force-dynamic';

export default async function AdminStudentsPage() {
  let students;
  try {
    students = await listAllStudents();
  } catch (err) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load students:{' '}
        {err instanceof Error ? err.message : 'Unknown error'}
      </div>
    );
  }
  return <AdminStudentsView students={students} />;
}