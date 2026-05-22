// src/app/(dashboard)/student/practice/page.tsx
import { Suspense } from 'react';
import { listMyPracticeSessions } from '@/lib/actions/practice';
import { listMyEnrolledClasses } from '@/lib/actions/enrollments';
import PracticeLandingView from '@/components/student/PracticeLandingView';

export const dynamic = 'force-dynamic';

export default async function StudentPracticePage() {
  // Pull enrolled classes for the lesson picker. Archived classes are
  // filtered out — students shouldn't be studying material from a class
  // that's been wound down. They can still upload files for those.
  let classes: Array<{ id: string; name: string; color: string | null }> = [];
  try {
    const enrolled = await listMyEnrolledClasses();
    classes = enrolled
      .filter((c) => !c.is_archived)
      .map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color ?? null,
      }));
  } catch {
    // Non-fatal: student can still upload files.
    classes = [];
  }

  const sessions = await listMyPracticeSessions();

  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading practice…</div>}>
      <PracticeLandingView sessions={sessions} classes={classes} />
    </Suspense>
  );
}