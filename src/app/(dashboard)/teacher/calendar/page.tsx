import { getTeacherCalendarItems } from '@/lib/actions/dashboard';
import { isoMonthStart, isoMonthEnd } from '@/lib/utils/calendar';
import FullCalendarView from '@/components/dashboard/FullCalendarView';

export const dynamic = 'force-dynamic';

export default async function TeacherCalendarPage() {
  const now = new Date();
  const monthStart = isoMonthStart(now.getFullYear(), now.getMonth());
  const monthEnd = isoMonthEnd(now.getFullYear(), now.getMonth());

  let initialData;
  try {
    initialData = await getTeacherCalendarItems(monthStart, monthEnd);
  } catch (err) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load calendar:{' '}
        {err instanceof Error ? err.message : 'Unknown error'}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] font-extrabold tracking-tight text-zinc-900">Calendar</h1>
        <p className="mt-1 text-sm text-zinc-500">Class deadlines and your personal tasks.</p>
      </div>

      <FullCalendarView
        initialData={initialData}
        fetcher={getTeacherCalendarItems}
        role="teacher"
        classesBasePath="/teacher/classes"
      />
    </div>
  );
}