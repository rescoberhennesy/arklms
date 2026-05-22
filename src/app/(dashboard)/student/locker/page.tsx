import { listMySubmissions } from '@/lib/actions/activities';
import StudentLockerView from '@/components/student/StudentLockerView';
import SetPageTitle from '@/components/dashboard/SetPageTitle';

export const dynamic = 'force-dynamic';

export default async function StudentLockerPage() {
  try {
    const submissions = await listMySubmissions();
    return (
      <>
        <SetPageTitle title="Locker" />
        <StudentLockerView submissions={submissions} />
      </>
    );
  } catch (err) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load your locker:{' '}
        {err instanceof Error ? err.message : 'Unknown error'}
      </div>
    );
  }
}