import {
  listMyEnrolledClasses,
  listMyPendingRequests,
  listMyRejectedRequests,
} from '@/lib/actions/enrollments';
import { getClassAvatars } from '@/lib/actions/classAvatars';
import { createClient } from '@/lib/supabase/server';
import StudentClassesView from '@/components/student/StudentClassesView';
import type { StudentClassListItem } from '@/types/class';

export const dynamic = 'force-dynamic';

export default async function StudentClassesPage() {
  let enrolledClasses: StudentClassListItem[];
  let pendingRequests;
  let rejectedRequests;
  try {
    [enrolledClasses, pendingRequests, rejectedRequests] = await Promise.all([
      listMyEnrolledClasses(),
      listMyPendingRequests(),
      listMyRejectedRequests(),
    ]);
  } catch (err) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load classes: {err instanceof Error ? err.message : 'Unknown error'}
      </div>
    );
  }

  // Get current user id to exclude self from classmate avatars
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const myId = user?.id;

  // Parallel-fetch classmate avatars for active (non-archived) classes
  const fetchable = enrolledClasses.filter((c) => !c.is_archived);
  const avatarResults = await Promise.all(
    fetchable.map((c) => getClassAvatars(c.id, myId)),
  );
  const avatarsById = new Map<string, StudentClassListItem['avatars']>();
  fetchable.forEach((c, i) => {
    const r = avatarResults[i];
    avatarsById.set(c.id, r.ok ? r.data : []);
  });

  const enrichedClasses: StudentClassListItem[] = enrolledClasses.map((c) => ({
    ...c,
    avatars: c.is_archived ? [] : avatarsById.get(c.id) ?? [],
  }));

  return (
    <StudentClassesView
      enrolledClasses={enrichedClasses}
      pendingRequests={pendingRequests}
      rejectedRequests={rejectedRequests}
    />
  );
}