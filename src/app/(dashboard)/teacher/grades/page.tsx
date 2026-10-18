import Link from 'next/link';
import { getMyClassGradebooks } from '@/lib/actions/gradebook';
import { listMyClasses } from '@/lib/actions/classes';
import { DEFAULT_CLASS_COLOR } from '@/types/class';
import GradebookTab from '@/components/teacher/GradebookTab';
import ShortcutClassPicker from '@/components/teacher/ShortcutClassPicker';

export const dynamic = 'force-dynamic';

interface PageProps {
  // Next.js 16: searchParams is a Promise.
  searchParams: Promise<{ classId?: string }>;
}

export default async function TeacherGradesPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const allClassesRes = await listMyClasses();

  if (!allClassesRes.ok) {
    return (
      <div className="space-y-5">
        <PageHeader />
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Failed to load classes: {allClassesRes.error}
        </div>
      </div>
    );
  }

  const classes = allClassesRes.data.filter((c) => !c.is_archived);

  if (classes.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader />
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <h3 className="text-base font-bold text-zinc-900">No active classes yet</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Create a class from the Classes page to start tracking grades.
          </p>
        </div>
      </div>
    );
  }

  const selected = classes.find((c) => c.id === sp.classId) ?? classes[0];

  // Only build the gradebook for the class being viewed (was: every class).
  const [entry] = await getMyClassGradebooks({
    classId: selected.id,
    section: null,
    track: null,
    gradeLevel: null,
  });

  const metaByClassId: Record<string, string> = {};
  for (const c of classes) {
    metaByClassId[c.id] = `${c.enrolled_count} ${c.enrolled_count === 1 ? 'student' : 'students'}`;
  }

  const accent = selected.color ?? DEFAULT_CLASS_COLOR;
  const meta = [selected.section, selected.grade_level, selected.semester].filter(Boolean).join(' · ');

  return (
    <div className="space-y-5">
      <PageHeader />

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-20">
          <ShortcutClassPicker classes={classes} selectedId={selected.id} metaByClassId={metaByClassId} />
        </div>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-full"
                style={{
                  backgroundColor: accent,
                  boxShadow: `0 0 0 4px color-mix(in oklab, ${accent} 25%, transparent)`,
                }}
              />
              <div className="min-w-0">
                <h2 className="truncate text-lg font-extrabold text-zinc-900">{selected.name}</h2>
                {meta && <p className="truncate text-[12.5px] text-zinc-500">{meta}</p>}
              </div>
            </div>
            <Link
              href={`/teacher/classes/${selected.id}?tab=grades`}
              className="text-[13px] font-bold text-red-700 hover:text-red-800"
            >
              Open class →
            </Link>
          </header>

          <div className="p-5">
            {entry ? (
              <GradebookTab key={selected.id} view={entry.gradebook} classId={selected.id} />
            ) : (
              <p className="py-10 text-center text-sm text-zinc-500">Couldn&apos;t load this gradebook.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-[28px] font-extrabold tracking-tight text-zinc-900">Grades</h1>
      <p className="mt-1 text-sm text-zinc-500">Pick a class to view its gradebook.</p>
    </div>
  );
}