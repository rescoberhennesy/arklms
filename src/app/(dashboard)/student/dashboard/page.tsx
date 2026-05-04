import {
  listMyEnrolledClasses,
  listMyPendingRequests,
} from '@/lib/actions/enrollments';
import StudentDashboardView from '@/components/students/StudentDashboardView';

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

  return (
    <StudentDashboardView
      enrolledCount={enrolledClasses.length}
      pendingCount={pendingRequests.length}
      recentClasses={enrolledClasses.slice(0, 3)}
    />
  );
}