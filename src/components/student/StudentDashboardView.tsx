'use client';

import Link from 'next/link';
import { BookOpen, Calendar as CalendarIcon, ListChecks } from 'lucide-react';
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
} from '@/lib/actions/dashboard';
import CalendarWidget from '@/components/dashboard/CalendarWidget';
import StudentTodoWidget from '@/components/dashboard/StudentTodoWidget';
import AnnouncementsWidget from '@/components/dashboard/AnnouncementsWidget';
import DashboardBanner from '@/components/dashboard/DashboardBanner';
import StatCardsRow from '@/components/dashboard/StatCardsRow';
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

      <StatCardsRow
        items={[
          {
            label: 'Enrolled classes',
            value: stats.enrolledClasses,
            icon: BookOpen,
            tone: 'red',
          },
          {
            label: 'Deadlines (7d)',
            value: stats.deadlines,
            icon: CalendarIcon,
            tone: 'amber',
          },
          {
            label: 'Pending tasks',
            value: stats.pendingTasks,
            icon: ListChecks,
            tone: 'indigo',
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Your classes</h2>
            <Link
              href="/student/classes"
              className="text-sm font-medium text-red-600 hover:text-red-700"
            >
              View all →
            </Link>
          </div>

          {pendingRequestsCount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              You have {pendingRequestsCount} pending join{' '}
              {pendingRequestsCount === 1 ? 'request' : 'requests'}.
              {' '}
              <Link
                href="/student/classes"
                className="font-medium underline-offset-2 hover:underline"
              >
                View requests
              </Link>
            </div>
          )}

          {previewClasses.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
              <p className="text-sm text-slate-600">
                You aren&apos;t enrolled in any classes yet.
              </p>
              <Link
                href="/student/classes"
                className="mt-3 inline-block text-sm font-medium text-red-600 hover:text-red-700"
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

        <aside className="space-y-4 lg:col-span-1">
          <CalendarWidget
            initialData={calendarData}
            fetcher={getStudentCalendarItems}
            role="student"
            classesBasePath="/student/classes"
          />
          <StudentTodoWidget items={todoItems} personalTasks={personalTasks} />
          <AnnouncementsWidget
            items={announcements}
            classesBasePath="/student/classes"
          />
        </aside>
      </div>
    </div>
  );
}