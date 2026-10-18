import Link from 'next/link';
import { getMyClassActivities } from '@/lib/actions/activities';
import { listMyClasses } from '@/lib/actions/classes';
import { DEFAULT_CLASS_COLOR } from '@/types/class';
import ActivitiesTab from '@/components/teacher/ActivitiesTab';
import ShortcutClassPicker from '@/components/teacher/ShortcutClassPicker';

export const dynamic = 'force-dynamic';

interface PageProps {
  // ?completion= and ?term= are read by ActivitiesTab itself.
  searchParams: Promise<{ classId?: string }>;
}

export default async function TeacherActivitiesPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const [allClassesRes, aggregated] = await Promise.all([
    listMyClasses(),
    getMyClassActivities({ classId: null, section: null, track: null, gradeLevel: null }),
  ]);

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
        <NoClasses message="Create a class from the Classes page to start adding activities." />
      </div>
    );
  }

  const byClassId = new Map(aggregated.map((a) => [a.class.id, a]));

  // Picker label: "N to grade" when there is grading to do, else activity count.
  const metaByClassId: Record<string, string> = {};
  for (const c of classes) {
    const acts = byClassId.get(c.id)?.activities ?? [];
    const toGrade = acts
      .filter((a) => a.published)
      .reduce((n, a) => n + a.submissions.filter((s) => s.grade === null).length, 0);
    metaByClassId[c.id] =
      toGrade > 0
        ? `${toGrade} to grade`
        : `${acts.length} ${acts.length === 1 ? 'activity' : 'activities'}`;
  }

  const selected = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const entry = byClassId.get(selected.id);
  const activities = entry?.activities ?? [];
  const roster = entry?.roster ?? [];

  // Open on "To grade" when this class has ungraded work (same as before).
  const hasUngraded = activities.some(
    (a) => a.published && a.submissions.some((s) => s.grade === null),
  );

  return (
    <div className="space-y-5">
      <PageHeader />

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-20">
          <ShortcutClassPicker classes={classes} selectedId={selected.id} metaByClassId={metaByClassId} />
        </div>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <ClassHeaderRow
            name={selected.name}
            color={selected.color}
            meta={[selected.section, selected.grade_level, selected.semester].filter(Boolean).join(' · ')}
            href={`/teacher/classes/${selected.id}?tab=activities`}
          />
          <div className="p-5">
            <ActivitiesTab
              key={selected.id}
              classId={selected.id}
              activities={activities}
              roster={roster}
              initialFilter={hasUngraded ? 'has_ungraded' : 'all'}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-[28px] font-extrabold tracking-tight text-zinc-900">Activities</h1>
      <p className="mt-1 text-sm text-zinc-500">Pick a class to manage and grade its activities.</p>
    </div>
  );
}

function ClassHeaderRow({
  name,
  color,
  meta,
  href,
}: {
  name: string;
  color: string | null;
  meta: string;
  href: string;
}) {
  const accent = color ?? DEFAULT_CLASS_COLOR;
  return (
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
          <h2 className="truncate text-lg font-extrabold text-zinc-900">{name}</h2>
          {meta && <p className="truncate text-[12.5px] text-zinc-500">{meta}</p>}
        </div>
      </div>
      <Link href={href} className="text-[13px] font-bold text-red-700 hover:text-red-800">
        Open class →
      </Link>
    </header>
  );
}

function NoClasses({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
      <h3 className="text-base font-bold text-zinc-900">No active classes yet</h3>
      <p className="mt-1 text-sm text-zinc-500">{message}</p>
    </div>
  );
}