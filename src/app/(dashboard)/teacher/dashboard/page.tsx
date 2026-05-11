import Link from 'next/link';
import { Users } from 'lucide-react';
import { listMyClasses } from '@/lib/actions/classes';
import {
  getTeacherCalendarActivities,
  getTeacherTodoItems,
} from '@/lib/actions/dashboard';
import { isoMonthStart, isoMonthEnd } from '@/lib/utils/calendar';
import type { TeacherClassListItem } from '@/types/class';
import ClassCover from '@/components/dashboard/ClassCover';
import CalendarWidget from '@/components/dashboard/CalendarWidget';
import TeacherTodoWidget from '@/components/dashboard/TeacherTodoWidget';

export const dynamic = 'force-dynamic';

export default async function TeacherDashboardPage() {
  const now = new Date();
  const monthStart = isoMonthStart(now.getFullYear(), now.getMonth());
  const monthEnd = isoMonthEnd(now.getFullYear(), now.getMonth());

  // Parallel-fetch everything. listMyClasses returns a Result; widget
  // actions throw on failure. Use allSettled so widget failures don't
  // blow up the whole page.
  const [classesResult, calendarResult, todoResult] = await Promise.allSettled([
    listMyClasses(),
    getTeacherCalendarActivities(monthStart, monthEnd),
    getTeacherTodoItems(),
  ]);

  const allClasses =
    classesResult.status === 'fulfilled' && classesResult.value.ok
      ? classesResult.value.data
      : [];
  const calendarActivities =
    calendarResult.status === 'fulfilled' ? calendarResult.value : [];
  const todoItems = todoResult.status === 'fulfilled' ? todoResult.value : [];

  const recentClasses = allClasses.slice(0, 3);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome back!</h1>
        <p className="mt-1 text-sm text-gray-600">
          Here&apos;s a quick overview of your classes.
        </p>
      </div>

      {/* Phase 8c widgets — full row, calendar 2/3 + todo 1/3 on lg */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CalendarWidget
            initialActivities={calendarActivities}
            fetcher={getTeacherCalendarActivities}
            role="teacher"
            classesBasePath="/teacher/classes"
          />
        </div>
        <div className="lg:col-span-1">
          <TeacherTodoWidget items={todoItems} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Active classes"
          value={allClasses.filter((c) => !c.is_archived).length}
        />
        <StatCard
          label="Archived classes"
          value={allClasses.filter((c) => c.is_archived).length}
        />
        <StatCard label="Total classes" value={allClasses.length} />
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent classes</h2>
          <Link
            href="/teacher/classes"
            className="text-sm font-medium text-red-600 hover:text-red-700"
          >
            View all →
          </Link>
        </div>
        {recentClasses.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
            <p className="text-sm text-gray-600">
              You haven&apos;t created any classes yet.
            </p>
            <Link
              href="/teacher/classes"
              className="mt-3 inline-block text-sm font-medium text-red-600 hover:text-red-700"
            >
              Go to My Classes to create one →
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

function RecentClassCard({ cls }: { cls: TeacherClassListItem }) {
  return (
    <Link
      href={`/teacher/classes/${cls.id}`}
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
        <div className="flex items-center gap-1 text-xs text-gray-600">
          <Users className="h-3.5 w-3.5" />
          <span>{cls.enrolled_count}</span>
        </div>
      </div>
    </Link>
  );
}