import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getStudentClassById } from '@/lib/actions/enrollments';

export const dynamic = 'force-dynamic';

const TABS = ['stream', 'modules', 'activities', 'grades'] as const;
type Tab = (typeof TABS)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function StudentClassDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;

  // Reject anything that isn't a UUID before hitting the database.
  // Non-UUIDs (e.g. accidentally pasted invite codes) bounce silently.
  if (!UUID_RE.test(id)) {
    redirect('/student/classes');
  }

  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? '')
    ? (tabParam as Tab)
    : 'stream';

  // Any error here — invalid id, RLS denial, not enrolled — means the student
  // shouldn't be on this page. Bounce silently rather than leak a DB error.
  let klass;
  try {
    klass = await getStudentClassById(id);
  } catch {
    redirect('/student/classes');
  }

  if (!klass) {
    redirect('/student/classes');
  }

  const headerColor = klass.color ?? '#FCA5A5';

  return (
    <div className="space-y-6">
      <Link
        href="/student/classes"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft size={16} />
        Back to classes
      </Link>

      {/* Header */}
      <div
        className="relative overflow-hidden rounded-xl px-6 py-8 text-white shadow-sm"
        style={{ backgroundColor: headerColor }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-black/0 to-black/15" />
        <div className="relative">
          <h1 className="text-3xl font-bold drop-shadow-sm">{klass.name}</h1>
          {klass.section && (
            <p className="mt-1 text-base font-medium text-white/90 drop-shadow-sm">
              {klass.section}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/90">
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium">
              {klass.semester}
            </span>
            {klass.teacher_name && (
              <span className="text-sm text-white/90">
                Teacher: <span className="font-medium">{klass.teacher_name}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <nav className="border-b border-gray-200">
        <div className="-mb-px flex gap-6 overflow-x-auto">
          {TABS.map((t) => {
            const isActive = t === tab;
            return (
              <Link
                key={t}
                href={`/student/classes/${id}?tab=${t}`}
                className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium capitalize transition ${
                  isActive
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
                }`}
              >
                {t}
              </Link>
            );
          })}
        </div>
      </nav>

      <div>
        {tab === 'stream' && <StreamTab description={klass.description} />}
        {tab === 'modules' && <ComingSoonTab title="Modules" />}
        {tab === 'activities' && <ComingSoonTab title="Activities" />}
        {tab === 'grades' && <ComingSoonTab title="Grades" />}
      </div>
    </div>
  );
}

function StreamTab({ description }: { description: string | null }) {
  return (
    <div className="space-y-4">
      {description && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            About this class
          </h3>
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {description}
          </p>
        </div>
      )}
      <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
        <h2 className="text-lg font-semibold text-gray-900">Class stream</h2>
        <p className="mt-1 text-sm text-gray-600">
          Announcements and class activity will appear here.
        </p>
      </div>
    </div>
  );
}

function ComingSoonTab({ title }: { title: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-600">This feature is coming soon.</p>
    </div>
  );
}
