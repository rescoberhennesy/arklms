
// src/app/(dashboard)/admin/students/page.tsx
import { listAllStudents } from '@/lib/actions/admin';

export const dynamic = 'force-dynamic';

function formatJoinDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="mt-1 text-sm text-gray-600">
            All registered student accounts.
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
          {students.length} total
        </span>
      </div>

      {students.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm italic text-gray-500">
          No student accounts registered yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Username</th>
                  <th className="px-4 py-2.5 text-right">Enrollments</th>
                  <th className="px-4 py-2.5">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {s.fullName ?? (
                        <span className="italic text-gray-400">No name</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{s.email}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {s.username ?? (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                      {s.enrollmentCount}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {formatJoinDate(s.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
