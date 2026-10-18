'use client';

import Link from 'next/link';
import { getStudentCalendarItems } from '@/lib/actions/dashboard';
import type {
  StudentTodoItem,
  RecentAnnouncementItem,
  PersonalTaskItem,
} from '@/lib/types/dashboard';
import type { StudentClassListItem } from '@/types/class';
import type {
  StudentStatCounts,
  CalendarFetchResult,
  DeadlineItem,
} from '@/lib/actions/dashboard';
import CalendarWidget from '@/components/dashboard/CalendarWidget';
import StudentTodoWidget from '@/components/dashboard/StudentTodoWidget';
import AnnouncementsWidget from '@/components/dashboard/AnnouncementsWidget';
import DashboardBanner from '@/components/dashboard/DashboardBanner';
import StudentStatCardsClient from '@/components/dashboard/StudentStatCardsClient';
import RichClassCard from '@/components/dashboard/RichClassCard';

interface StudentDashboardViewProps {
  greeting: string;
  userName: string;
  todayLabel: string;
  todayDayOfMonth: number;
  stats: StudentStatCounts;
  pendingRequestsCount: number;
  previewClasses: StudentClassListItem[];
  calendarData: CalendarFetchResult;
  todoItems: StudentTodoItem[];
  announcements: RecentAnnouncementItem[];
  personalTasks: PersonalTaskItem[];
  deadlineItems: DeadlineItem[];
}

export default function StudentDashboardView({
  greeting,
  userName,
  todayLabel,
  todayDayOfMonth,
  stats,
  pendingRequestsCount,
  previewClasses,
  calendarData,
  todoItems,
  announcements,
  personalTasks,
  deadlineItems,
}: StudentDashboardViewProps) {
  return (
    <div className="space-y-6">
      <DashboardBanner
        greeting={greeting}
        userName={userName}
        subtitle="Here's your week at a glance."
        todayLabel={todayLabel}
        todayDayOfMonth={todayDayOfMonth}
        showCreateClass={false}
      />

      <StudentStatCardsClient
        enrolledClasses={stats.enrolledClasses}
        deadlinesCount={stats.deadlines}
        pendingCount={stats.pendingTasks}
        deadlineItems={deadlineItems}
        todoItems={todoItems}
        personalTasks={personalTasks}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* LEFT: Your classes → To-do */}
        <div className="min-w-0 space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight text-zinc-900">Your classes</h2>
              <Link href="/student/classes" className="text-sm font-bold text-red-700 hover:text-red-800">
                View all →
              </Link>
            </div>

            {pendingRequestsCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm">
                <span className="text-zinc-700">
                  <b className="font-bold text-zinc-900">{pendingRequestsCount}</b> pending join{' '}
                  {pendingRequestsCount === 1 ? 'request' : 'requests'}, waiting for teacher approval.
                </span>
                <Link href="/student/classes" className="text-sm font-bold text-red-700 hover:text-red-800">
                  View requests →
                </Link>
              </div>
            )}

            {previewClasses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
                <p className="text-sm text-zinc-600">You aren&apos;t enrolled in any classes yet.</p>
                <Link
                  href="/student/classes"
                  className="mt-3 inline-block text-sm font-bold text-red-700 hover:text-red-800"
                >
                  Find classes to join →
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {previewClasses.map((c) => (
                  <RichClassCard key={c.id} role="student" cls={c} />
                ))}
              </div>
            )}
          </section>

          <StudentTodoWidget items={todoItems} personalTasks={personalTasks} />
        </div>

        {/* RIGHT: Calendar → Announcements */}
        <aside className="space-y-5">
          <CalendarWidget
            initialData={calendarData}
            fetcher={getStudentCalendarItems}
            role="student"
            classesBasePath="/student/classes"
          />
          <AnnouncementsWidget items={announcements} classesBasePath="/student/classes" />
        </aside>
      </div>
    </div>
  );
}