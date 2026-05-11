// src/components/student/StudentDashboardView.tsx
//
// Phase 8c Slice D — widgets slotted in above the existing StatCard +
// recent-classes content.
//
// Calendar takes the full row on mobile; on lg, calendar gets 2/3 and
// the to-do widget gets 1/3.

'use client';

import Link from 'next/link';
import CalendarWidget from '@/components/dashboard/CalendarWidget';
import StudentTodoWidget from '@/components/dashboard/StudentTodoWidget';
import { getStudentCalendarActivities } from '@/lib/actions/dashboard';
import type {
  CalendarActivity,
  StudentTodoItem,
} from '@/lib/types/dashboard';
import type { StudentClassListItem } from '@/types/class';
import ClassCover from '@/components/dashboard/ClassCover';

interface StudentDashboardViewProps {
  activeCount: number;
  pendingCount: number;
  recentClasses: StudentClassListItem[];
  calendarActivities: CalendarActivity[];
  todoItems: StudentTodoItem[];
}

export default function StudentDashboardView({
  activeCount,
  pendingCount,
  recentClasses,
  calendarActivities,
  todoItems,
}: StudentDashboardViewProps) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome back!</h1>
        <p className="mt-1 text-sm text-gray-600">
          Here&apos;s your week at a glance.
        </p>
      </div>

      {/* Phase 8c widgets — full row, calendar 2/3 + todo 1/3 on lg */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CalendarWidget
            initialActivities={calendarActivities}
            fetcher={getStudentCalendarActivities}
            role="student"
            classesBasePath="/student/classes"
          />
        </div>
        <div className="lg:col-span-1">
          <StudentTodoWidget items={todoItems} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Active classes" value={activeCount} />
        <StatCard label="Pending requests" value={pendingCount} />
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent classes</h2>
          <Link
            href="/student/classes"
            className="text-sm font-medium text-red-600 hover:text-red-700"
          >
            View all →
          </Link>
        </div>
        {recentClasses.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
            <p className="text-sm text-gray-600">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentClasses.map((c) => (
              <RecentClassCard key={c.id} cls={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function RecentClassCard({ cls }: { cls: StudentClassListItem }) {
  return (
    <Link
      href={`/student/classes/${cls.id}`}
      className="block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <ClassCover
        url={cls.cover_photo_url}
        color={cls.color}
        className="h-24 w-full"
      >
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3 className="truncate text-base font-semibold text-white drop-shadow-sm">
            {cls.name}
          </h3>
          {cls.section && (
            <p className="truncate text-xs text-white/90 drop-shadow-sm">
              {cls.section}
            </p>
          )}
        </div>
      </ClassCover>
      <div className="flex items-center justify-between p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {cls.semester}
        </p>
        {cls.teacher_name && (
          <p className="truncate text-xs text-gray-600">{cls.teacher_name}</p>
        )}
      </div>
    </Link>
  );
}