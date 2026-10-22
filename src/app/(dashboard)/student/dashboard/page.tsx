import {
  listMyEnrolledClasses,
  listMyPendingRequests,
} from '@/lib/actions/enrollments';
import {
  getStudentCalendarItems,
  getStudentTodoItems,
  getStudentStatCounts,
  listMyDeadlinesNext7Days,
  type StudentStatCounts,
} from '@/lib/actions/dashboard';
import { listMyActivePersonalTasks } from '@/lib/actions/personalTasks';
import { listRecentAnnouncementsAcrossClasses } from '@/lib/actions/announcements';
import { isoMonthStart, isoMonthEnd } from '@/lib/utils/calendar';
import { createClient } from '@/lib/supabase/server';
import { manilaGreeting, manilaShortDate, manilaDay, manilaYearMonth } from '@/lib/manilaTime';
import StudentDashboardView from '@/components/student/StudentDashboardView';

export const dynamic = 'force-dynamic';

async function getUserDisplayName(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 'there';
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();
  const name = profile?.full_name?.trim();
  if (name) return name.split(' ')[0];
  return user.email?.split('@')[0] ?? 'there';
}

export default async function StudentDashboardPage() {
  const now = new Date();
  const { year, month } = manilaYearMonth(now);
  const monthStart = isoMonthStart(year, month);
  const monthEnd = isoMonthEnd(year, month);

  let enrolledClasses;
  let pendingRequests;
  let calendarData;
  let todoItems;
  let stats: StudentStatCounts;
  let announcements;
  let personalTasks;
  let deadlineItems;
  let userName: string;

  try {
    [
      enrolledClasses,
      pendingRequests,
      calendarData,
      todoItems,
      stats,
      announcements,
      personalTasks,
      deadlineItems,
      userName,
    ] = await Promise.all([
      listMyEnrolledClasses(),
      listMyPendingRequests(),
      getStudentCalendarItems(monthStart, monthEnd),
      getStudentTodoItems(),
      getStudentStatCounts(),
      listRecentAnnouncementsAcrossClasses(5),
      listMyActivePersonalTasks(),
      listMyDeadlinesNext7Days(),
      getUserDisplayName(),
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
  const previewClasses = activeClasses.slice(0, 6);

  return (
    <StudentDashboardView
      greeting={manilaGreeting(now)}
      userName={userName}
      todayLabel={manilaShortDate(now)}
      todayDayOfMonth={manilaDay(now)}
      stats={stats}
      pendingRequestsCount={pendingRequests.length}
      previewClasses={previewClasses}
      calendarData={calendarData}
      todoItems={todoItems}
      announcements={announcements}
      personalTasks={personalTasks}
      deadlineItems={deadlineItems}
    />
  );
}