
// src/app/(dashboard)/admin/dashboard/page.tsx
import { Users, GraduationCap, BookOpen } from 'lucide-react';
import { getAdminDashboardStats } from '@/lib/actions/admin';

// Live data — never serve a statically cached count.
export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  let stats;
  try {
    stats = await getAdminDashboardStats();
  } catch (err) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load admin dashboard:{' '}
        {err instanceof Error ? err.message : 'Unknown error'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin overview</h1>
        <p className="mt-1 text-sm text-gray-600">
          Institution-wide totals across all users and classes.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Registered Teachers"
          value={stats.teacherCount}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Registered Students"
          value={stats.studentCount}
          icon={<GraduationCap className="h-5 w-5" />}
        />
        <StatCard
          label="Active Classes"
          value={stats.activeSectionCount}
          icon={<BookOpen className="h-5 w-5" />}
          hint={
            stats.archivedSectionCount > 0
              ? `${stats.archivedSectionCount} archived`
              : undefined
          }
        />
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  hint?: string;
}

function StatCard({ label, value, icon, hint }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </p>
        <span className="rounded-lg bg-red-50 p-2 text-red-600">{icon}</span>
      </div>
      <p className="mt-3 text-4xl font-bold text-gray-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
