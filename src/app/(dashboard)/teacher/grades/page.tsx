import Link from 'next/link';
import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import {
  getMyClassGradebooks,
  type MyClassGradebooksFilters,
} from '@/lib/actions/gradebook';
import { listMyClasses } from '@/lib/actions/classes';
import GradebookTab from '@/components/teacher/GradebookTab';
import TeacherGradesFilterBar from '@/components/teacher/TeacherGradesFilterBar';

export const dynamic = 'force-dynamic';

interface PageProps {
  // Next.js 16: searchParams is a Promise.
  searchParams: Promise<{
    classId?: string;
    section?: string;
    track?: string;
    grade?: string;
  }>;
}

export default async function TeacherGradesPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const filters: MyClassGradebooksFilters = {
    classId: sp.classId || null,
    section: sp.section || null,
    track: sp.track || null,
    gradeLevel: sp.grade || null,
  };

  // We fetch both: the full active class list (so the filter bar's class /
  // section dropdowns show every option, not just the matched ones), and the
  // filtered gradebooks for the stacked view below. Two server actions, but
  // listMyClasses is cheap (one query + count); the expensive piece is the
  // per-class getGradebookView fan-out inside getMyClassGradebooks.
  const [allClassesRes, aggregated] = await Promise.all([
    listMyClasses(),
    getMyClassGradebooks(filters),
  ]);

  if (!allClassesRes.ok) {
    return (
      <div className="space-y-4 p-6">
        <PageHeader />
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Failed to load classes: {allClassesRes.error}
        </div>
      </div>
    );
  }

  const allActiveClasses = allClassesRes.data.filter((c) => !c.is_archived);
  const totalCount = allActiveClasses.length;
  const matchedCount = aggregated.length;

  return (
    <div className="space-y-4 p-6">
      <PageHeader />

      <TeacherGradesFilterBar
        classes={allActiveClasses}
        matchedCount={matchedCount}
        totalCount={totalCount}
      />

      {totalCount === 0 ? (
        <EmptyState
          title="No active classes yet"
          message="You don't have any active classes. Create one from the Classes page to start tracking grades."
        />
      ) : matchedCount === 0 ? (
        <EmptyState
          title="No classes match your filters"
          message="Try clearing one or more filters to see your gradebooks."
        />
      ) : (
        <div className="space-y-8">
          {aggregated.map(({ class: c, gradebook }) => (
            <section
              key={c.id}
              className="rounded-xl border border-gray-200 bg-white shadow-sm"
            >
              {/* Per-class header — keeps each block clearly attributed.
                  The gradebook itself is unchanged: same export button, same
                  weights modal, same per-class semantics. */}
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    {c.name}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {[c.section, c.grade_level, c.track, c.semester]
                      .filter(Boolean)
                      .join(' · ') || 'No section info'}
                    {' · '}
                    {c.enrolled_count}{' '}
                    {c.enrolled_count === 1 ? 'student' : 'students'}
                  </p>
                </div>
                <Link
                  href={`/teacher/classes/${c.id}?tab=grades`}
                  className="text-xs font-medium text-red-700 hover:text-red-800 hover:underline"
                >
                  Open class →
                </Link>
              </header>
              <div className="p-5">
                <GradebookTab view={gradebook} classId={c.id} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Link
          href="/teacher/dashboard"
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to dashboard
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-gray-900">
          <ClipboardCheck className="h-6 w-6 text-red-600" />
          Grades
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Gradebooks across all your classes. Each class is shown as its own
          block — grades aren't comparable across different subjects.
        </p>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{message}</p>
    </div>
  );
}