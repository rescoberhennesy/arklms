import Link from 'next/link';
import { ArrowLeft, FolderOpen } from 'lucide-react';
import {
  getMyClassModules,
  type MyClassModulesFilters,
} from '@/lib/actions/modules';
import { listMyClasses } from '@/lib/actions/classes';
import ModulesTab from '@/components/teacher/ModulesTab';
import TeacherModulesFilterBar from '@/components/teacher/TeacherModulesFilterBar';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    classId?: string;
    section?: string;
    track?: string;
    grade?: string;
  }>;
}

export default async function TeacherModulesPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const filters: MyClassModulesFilters = {
    classId: sp.classId || null,
    section: sp.section || null,
    track: sp.track || null,
    gradeLevel: sp.grade || null,
  };

  const [allClassesRes, aggregated] = await Promise.all([
    listMyClasses(),
    getMyClassModules(filters),
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

      <TeacherModulesFilterBar
        classes={allActiveClasses}
        matchedCount={matchedCount}
        totalCount={totalCount}
      />

      {totalCount === 0 ? (
        <EmptyState
          title="No active classes yet"
          message="You don't have any active classes. Create one from the Classes page to start building modules."
        />
      ) : matchedCount === 0 ? (
        <EmptyState
          title="No classes match your filters"
          message="Try clearing one or more filters to see your modules."
        />
      ) : (
        <div className="space-y-8">
          {aggregated.map(({ class: c, modules }) => {
            const lessonCount = modules.reduce(
              (sum, m) => sum + m.lessons.length,
              0,
            );
            return (
              <section
                key={c.id}
                className="rounded-xl border border-gray-200 bg-white shadow-sm"
              >
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
                      {modules.length}{' '}
                      {modules.length === 1 ? 'module' : 'modules'}
                      {' · '}
                      {lessonCount}{' '}
                      {lessonCount === 1 ? 'lesson' : 'lessons'}
                    </p>
                  </div>
                  <Link
                    href={`/teacher/classes/${c.id}?tab=modules`}
                    className="text-xs font-medium text-red-700 hover:text-red-800 hover:underline"
                  >
                    Open class →
                  </Link>
                </header>
                <div className="p-5">
                  {/* ModulesTab is fully self-contained. AddModuleBar (with
                      its expanded-form state), dnd reorder for both modules
                      and lessons inside a module, term-changing dropdown,
                      delete confirms — all of it works inside each block.
                      Each block's classId is scoped correctly, so creating
                      a module inside block #3 lands it in class #3. */}
                  <ModulesTab classId={c.id} initialModules={modules} />
                </div>
              </section>
            );
          })}
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
          <FolderOpen className="h-6 w-6 text-red-600" />
          Modules
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Modules and lessons across all your classes. Each class keeps its
          own term ordering — modules aren't reorderable across classes.
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