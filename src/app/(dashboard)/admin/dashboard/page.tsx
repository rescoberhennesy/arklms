import {
  getAdminDashboardStats,
  getAdminRecentActivity,
  getAdminChartData,
} from '@/lib/actions/admin';
import AdminDashboardView from '@/components/admin/AdminDashboardView';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  try {
    const [stats, activity, charts] = await Promise.all([
      getAdminDashboardStats(),
      getAdminRecentActivity(10),
      getAdminChartData(),
    ]);

    return (
      <AdminDashboardView stats={stats} activity={activity} charts={charts} />
    );
  } catch (err) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load admin dashboard:{' '}
        {err instanceof Error ? err.message : 'Unknown error'}
      </div>
    );
  }
}