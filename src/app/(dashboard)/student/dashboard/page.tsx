import {
  listMyEnrolledClasses,
  listMyPendingRequests,
} from '@/lib/actions/enrollments';
import {
  getStudentCalendarActivities,
  getStudentTodoItems,
} from '@/lib/actions/dashboard';
import { isoMonthStart, isoMonthEnd } from '@/lib/utils/calendar';
import StudentDashboardView from '@/components/student/StudentDashboardView';

export const dynamic = 'force-dynamic';

export default async function StudentDashboardPage() {
  // Anchor month = server's "now". PH-only userbase, timezone drift n/a.
  const now = new Date();
  const monthStart = isoMonthStart(now.getFullYear(), now.getMonth());
  const monthEnd = isoMonthEnd(now.getFullYear(), now.getMonth());

  let enrolledClasses;
  let pendingRequests;
  let calendarActivities;
  let todoItems;
  try {
    [enrolledClasses, pendingRequests, calendarActivities, todoItems] =
      await Promise.all([
        listMyEnrolledClasses(),
        listMyPendingRequests(),
        getStudentCalendarActivities(monthStart, monthEnd),
        getStudentTodoItems(),
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
      calendarActivities={calendarActivities}
      todoItems={todoItems}
    />
  );
}