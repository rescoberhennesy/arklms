import { getStudentCalendarItems } from '@/lib/actions/dashboard';
import { isoMonthStart, isoMonthEnd } from '@/lib/utils/calendar';
import FullCalendarView from '@/components/dashboard/FullCalendarView';

export const dynamic = 'force-dynamic';

export default async function StudentCalendarPage() {
  const now = new Date();
  const monthStart = isoMonthStart(now.getFullYear(), now.getMonth());
  const monthEnd = isoMonthEnd(now.getFullYear(), now.getMonth());

  let initialData;
  try {
    initialData = await getStudentCalendarItems(monthStart, monthEnd);
  } catch (err) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load calendar:{' '}
        {err instanceof Error ? err.message : 'Unknown error'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        <p className="mt-1 text-sm text-gray-600">
          All upcoming activity due dates from your classes and your personal tasks.
        </p>
      </div>
      <FullCalendarView
        initialData={initialData}
        fetcher={getStudentCalendarItems}
        role="student"
        classesBasePath="/student/classes"
      />
    </div>
  );
}