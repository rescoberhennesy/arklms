import {
  listMyEnrolledClasses,
  listMyPendingRequests,
} from '@/lib/actions/enrollments';
import {
  getStudentCalendarItems,
  getStudentTodoItems,
  getStudentStatCounts,
  type StudentStatCounts,
} from '@/lib/actions/dashboard';
import { listMyActivePersonalTasks } from '@/lib/actions/personalTasks';
import { listRecentAnnouncementsAcrossClasses } from '@/lib/actions/announcements';
import { isoMonthStart, isoMonthEnd } from '@/lib/utils/calendar';
import { createClient } from '@/lib/supabase/server';
import StudentDashboardView from '@/components/student/StudentDashboardView';

export const dynamic = 'force-dynamic';

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

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
  const monthStart = isoMonthStart(now.getFullYear(), now.getMonth());
  const monthEnd = isoMonthEnd(now.getFullYear(), now.getMonth());

  let enrolledClasses;
  let pendingRequests;
  let calendarData;
  let todoItems;
  let stats: StudentStatCounts;
  let announcements;
  let personalTasks;
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
      userName,
    ] = await Promise.all([
      listMyEnrolledClasses(),
      listMyPendingRequests(),
      getStudentCalendarItems(monthStart, monthEnd),
      getStudentTodoItems(),
      getStudentStatCounts(),
      listRecentAnnouncementsAcrossClasses(5),
      listMyActivePersonalTasks(),
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

  const todayLabel = now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <StudentDashboardView
      greeting={greetingForHour(now.getHours())}
      userName={userName}
      todayLabel={todayLabel}
      todayDayOfMonth={now.getDate()}
      stats={stats}
      pendingRequestsCount={pendingRequests.length}
      previewClasses={previewClasses}
      calendarData={calendarData}
      todoItems={todoItems}
      announcements={announcements}
      personalTasks={personalTasks}
    />
  );
}