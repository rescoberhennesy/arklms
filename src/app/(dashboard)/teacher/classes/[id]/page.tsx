import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getClassById } from '@/lib/actions/classes';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const TABS = ['stream', 'modules', 'people', 'grades'] as const;
type Tab = (typeof TABS)[number];

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function ClassDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;

  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? '')
    ? (tabParam as Tab)
    : 'stream';

  const result = await getClassById(id);
  if (!result.ok) notFound();
  const klass = result.data;

  return (
    <div className="space-y-6">
      <Link
        href="/teacher/classes"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft size={16} />
        Back to classes
      </Link>

      <div
        className="rounded-xl px-6 py-8 text-white shadow-sm"
        style={{ backgroundColor: klass.color }}
      >
        <h1 className="text-3xl font-bold">{klass.name}</h1>
        {klass.section && (
          <p className="mt-1 text-base font-medium text-white/90">
            {klass.section}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-white/90">
          {klass.subject_code && <span>{klass.subject_code}</span>}
          <span>{klass.semester}</span>
          <span className="ml-auto">
            Invite code:{' '}
            <code className="rounded bg-white/20 px-2 py-0.5 font-mono">
              {klass.invite_code}
            </code>
          </span>
        </div>
      </div>

      <nav className="border-b border-gray-200">
        <div className="-mb-px flex gap-6">
          {TABS.map((t) => {
            const isActive = t === tab;
            return (
              <Link
                key={t}
                href={`/teacher/classes/${id}?tab=${t}`}
                className={`border-b-2 px-1 py-3 text-sm font-medium capitalize transition ${
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
        {tab === 'people' && <PeopleTab classId={klass.id} />}
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
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {description}
          </p>
        </div>
      )}
      <ComingSoonTab
        title="Class Stream"
        description="Announcements, posts, and class activity will appear here."
      />
    </div>
  );
}

function ComingSoonTab({
  title,
  description = 'This feature is coming soon.',
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-600">{description}</p>
    </div>
  );
}

async function PeopleTab({ classId }: { classId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('class_enrollments')
    .select(
      `
      id,
      enrolled_at,
      profiles:student_id (
        id,
        email,
        full_name,
        avatar_url
      )
    `,
    )
    .eq('class_id', classId)
    .order('enrolled_at', { ascending: true });

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Could not load students: {error.message}
      </div>
    );
  }

type ProfileRef = {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  type EnrollmentRow = {
    id: string;
    enrolled_at: string;
    profiles: ProfileRef | ProfileRef[] | null;
  };

  const enrollments = ((data ?? []) as unknown as EnrollmentRow[]).map((row) => ({
    id: row.id,
    enrolled_at: row.enrolled_at,
    // Supabase sometimes returns the joined relation as a single-item array;
    // normalize to a single object (or null) for cleaner rendering below.
    profile: Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles,
  }));

  if (enrollments.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
        <h2 className="text-lg font-semibold text-gray-900">No students yet</h2>
        <p className="mt-1 text-sm text-gray-600">
          Share the invite code with students so they can join the class.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
              Student
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
              Email
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
              Joined
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {enrollments.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-3 text-sm text-gray-900">
                {e.profile?.full_name ?? '—'}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">
                {e.profile?.email ?? '—'}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500">
                {new Date(e.enrolled_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}