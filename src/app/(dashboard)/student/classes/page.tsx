import {
  listMyEnrolledClasses,
  listMyPendingRequests,
} from '@/lib/actions/enrollments';
import StudentClassesView from '@/components/students/StudentClassesView';

export const dynamic = 'force-dynamic';

export default async function StudentClassesPage() {
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
        Failed to load classes: {err instanceof Error ? err.message : 'Unknown error'}
      </div>
    );
  }

  return (
    <StudentClassesView
      enrolledClasses={enrolledClasses}
      pendingRequests={pendingRequests}
    />
  );
}