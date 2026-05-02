import Link from 'next/link';
import { listMyClasses } from '@/lib/actions/classes';
import ClassCard from '@/components/teacher/ClassCard';

export const dynamic = 'force-dynamic';

export default async function TeacherDashboardPage() {
  const result = await listMyClasses();
  const allClasses = result.ok ? result.data : [];
  const recentClasses = allClasses.slice(0, 3);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome back!</h1>
        <p className="mt-1 text-sm text-gray-600">
          Here&apos;s a quick overview of your classes.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Active classes"
          value={allClasses.filter((c) => !c.is_archived).length}
        />
        <StatCard
          label="Archived classes"
          value={allClasses.filter((c) => c.is_archived).length}
        />
        <StatCard label="Total classes" value={allClasses.length} />
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent classes</h2>
          <Link
            href="/teacher/classes"
            className="text-sm font-medium text-red-600 hover:text-red-700"
          >
            View all →
          </Link>
        </div>

        {recentClasses.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
            <p className="text-sm text-gray-600">
              You haven&apos;t created any classes yet.
            </p>
            <Link
              href="/teacher/classes"
              className="mt-3 inline-block text-sm font-medium text-red-600 hover:text-red-700"
            >
              Go to My Classes to create one →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {recentClasses.map((c) => (
              <ClassCard key={c.id} classRow={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}