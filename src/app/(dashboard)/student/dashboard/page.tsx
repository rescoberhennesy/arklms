import {
  listMyEnrolledClasses,
  listMyPendingRequests,
} from '@/lib/actions/enrollments';
import StudentDashboardView from '@/components/student/StudentDashboardView';

export const dynamic = 'force-dynamic';

export default async function StudentDashboardPage() {
  let enrolledClasses;
  let pendingRequests;
  try {
    [enrolledClasses, pendingRequests] = await Promise.all([
      listMyEnrolledClasses(),
      listMyPendingRequests(),
    ]);
  } catch (err) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load dashboard:{' '}
        {err instanceof Error ? err.message : 'Unknown error'}
      </div>
    );
  }

  const activeClasses = enrolledClasses.filter((c) => !c.is_archived);

  return (
    <StudentDashboardView
      activeCount={activeClasses.length}
      pendingCount={pendingRequests.length}
      recentClasses={activeClasses.slice(0, 3)}
    />
  );
}