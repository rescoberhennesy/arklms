import { listMyClasses } from '@/lib/actions/classes';
import {
  getTeacherCalendarItems,
  getTeacherTodoItems,
  getTeacherStatCounts,
  listMyDeadlinesNext7Days,
  type TeacherStatCounts,
} from '@/lib/actions/dashboard';
import { listMyActivePersonalTasks } from '@/lib/actions/personalTasks';
import TeacherStatCardsClient from '@/components/dashboard/TeacherStatCardsClient';
import { listRecentAnnouncementsAcrossClasses } from '@/lib/actions/announcements';
import { isoMonthStart, isoMonthEnd } from '@/lib/utils/calendar';
import { createClient } from '@/lib/supabase/server';
import CalendarWidget from '@/components/dashboard/CalendarWidget';
import TeacherTodoWidget from '@/components/dashboard/TeacherTodoWidget';
import ClassDeadlinesWidget from '@/components/dashboard/ClassDeadlinesWidget';
import AnnouncementsWidget from '@/components/dashboard/AnnouncementsWidget';
import DashboardBanner from '@/components/dashboard/DashboardBanner';
import RichClassCard from '@/components/dashboard/RichClassCard';
import QuickActionsRow from '@/components/dashboard/QuickActionsRow';
import Link from 'next/link';

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

export default async function TeacherDashboardPage() {
  const now = new Date();
  const monthStart = isoMonthStart(now.getFullYear(), now.getMonth());
  const monthEnd = isoMonthEnd(now.getFullYear(), now.getMonth());

  const [
    classesResult,
    calendarResult,
    todoResult,
    statResult,
    announcementsResult,
    personalTasksResult,
    deadlineItems,
    userName,
  ] = await Promise.all([
    listMyClasses(),
    getTeacherCalendarItems(monthStart, monthEnd).catch(() => ({
      activities: [],
      personalTasks: [],
    })),
    getTeacherTodoItems().catch(() => []),
    getTeacherStatCounts().catch(
      (): TeacherStatCounts => ({
        totalClasses: 0,
        deadlines: 0,
        pendingTasks: 0,
      }),
    ),
    listRecentAnnouncementsAcrossClasses(5).catch(() => []),
    listMyActivePersonalTasks().catch(() => []),
    listMyDeadlinesNext7Days().catch(() => []),
    getUserDisplayName(),
  ]);

  const deadlineItemsSafe = Array.isArray(deadlineItems) ? deadlineItems : [];

  const allClasses = classesResult.ok ? classesResult.data : [];
  const calendarData = calendarResult;
  const todoItems = todoResult;
  const stats = statResult;
  const announcements = announcementsResult;
  const personalTasks = personalTasksResult;

  const activeClasses = allClasses.filter((c) => !c.is_archived);
  const previewClasses = activeClasses.slice(0, 6);

  const todayLabel = now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="space-y-6">
      <DashboardBanner
        greeting={greetingForHour(now.getHours())}
        userName={userName}
        subtitle="Ready to keep teaching?"
        todayLabel={todayLabel}
        todayDayOfMonth={now.getDate()}
        showCreateClass
      />

      <TeacherStatCardsClient
        totalClasses={stats.totalClasses}
        deadlinesCount={stats.deadlines}
        pendingCount={stats.pendingTasks}
        deadlineItems={deadlineItemsSafe}
        todoItems={todoItems}
        personalTasks={personalTasks}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* LEFT: Your classes → Class deadlines → Quick actions */}
        <div className="min-w-0 space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight text-zinc-900">Your classes</h2>
              <Link href="/teacher/classes" className="text-sm font-bold text-red-700 hover:text-red-800">
                View all →
              </Link>
            </div>
            {previewClasses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
                <p className="text-sm text-zinc-600">You haven&apos;t created any classes yet.</p>
                <Link
                  href="/teacher/classes?create=1"
                  className="mt-3 inline-block text-sm font-bold text-red-700 hover:text-red-800"
                >
                  Create your first class →
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {previewClasses.map((c) => (
                  <RichClassCard key={c.id} role="teacher" cls={c} />
                ))}
              </div>
            )}
          </section>

          <ClassDeadlinesWidget items={todoItems} />

          <QuickActionsRow />
        </div>

        {/* RIGHT: Calendar → To-do → Announcements */}
        <aside className="space-y-5">
          <CalendarWidget
            initialData={calendarData}
            fetcher={getTeacherCalendarItems}
            role="teacher"
            classesBasePath="/teacher/classes"
          />
          <TeacherTodoWidget items={todoItems} personalTasks={personalTasks} />
          <AnnouncementsWidget items={announcements} classesBasePath="/teacher/classes" />
        </aside>
      </div>
    </div>
  );
}