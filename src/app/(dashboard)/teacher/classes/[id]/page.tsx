import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Settings } from 'lucide-react';
import { getClassById } from '@/lib/actions/classes';
import { DEFAULT_CLASS_COLOR } from '@/types/class';
import {
  listPendingJoinRequests,
  listClassRoster,
} from '@/lib/actions/enrollments';
import { CopyButton } from '@/components/teacher/CopyButton';
import SetPageTitle from '@/components/dashboard/SetPageTitle';
import StreamView from '@/components/dashboard/StreamView';
import InviteCodeStrip from '@/components/teacher/InviteCodeStrip';
import { StudentsTab } from '@/components/teacher/StudentsTab';
import { listAnnouncements } from '@/lib/actions/announcements';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const TABS = ['stream', 'modules', 'activities', 'students', 'grades'] as const;
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

  const classRes = await getClassById(id);
  if (!classRes.ok) notFound();
  const klass = classRes.data;
  if (!klass) notFound();

  // Pre-fetch students-tab data on the server when that tab is active
  let pendingRequests: Awaited<ReturnType<typeof listPendingJoinRequests>> = [];
  let roster: Awaited<ReturnType<typeof listClassRoster>> = [];
  if (tab === 'students') {
    [pendingRequests, roster] = await Promise.all([
      listPendingJoinRequests(klass.id),
      listClassRoster(klass.id),
    ]);
  }

  // Pre-fetch stream-tab data on the server when that tab is active
  let announcements: Awaited<ReturnType<typeof listAnnouncements>> = [];
  let currentUserId = '';
  if (tab === 'stream') {
    const supabase = await createClient();
    const [{ data: { user } }, anns] = await Promise.all([
      supabase.auth.getUser(),
      listAnnouncements(klass.id),
    ]);
    currentUserId = user?.id ?? '';
    announcements = anns;
  }

  const headerColor = klass.color ?? DEFAULT_CLASS_COLOR;

  return (
    <div className="space-y-6">
      <SetPageTitle title={klass.name} />
      <Link
        href="/teacher/classes"
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
        <Link
          href={`/teacher/classes/${klass.id}/settings`}
          className="absolute right-4 top-4 z-10 rounded-full bg-white/20 p-2 text-white shadow-sm hover:bg-white/30"
          aria-label="Class settings"
        >
          <Settings className="h-4 w-4" />
        </Link>
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
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-white/80">
                Code
              </span>
              <code className="rounded bg-white/20 px-2 py-0.5 font-mono text-sm">
                {klass.invite_code}
              </code>
              <CopyButton text={klass.invite_code} />
            </div>
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
                href={`/teacher/classes/${id}?tab=${t}`}
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
        {tab === 'stream' && (
          <StreamTab
            description={klass.description}
            classId={klass.id}
            inviteCode={klass.invite_code}
            inviteCodeExpiresAt={klass.invite_code_expires_at}
            inviteCodeDisabled={klass.invite_code_disabled}
            announcements={announcements}
            currentUserId={currentUserId}
          />
        )}
        {tab === 'modules' && <ComingSoonTab title="Modules" />}
        {tab === 'activities' && <ComingSoonTab title="Activities" />}
        {tab === 'students' && (
          <StudentsTab
            classId={klass.id}
            initialPending={pendingRequests}
            initialRoster={roster}
          />
        )}
        {tab === 'grades' && <ComingSoonTab title="Grades" />}
      </div>
    </div>
  );
}

function StreamTab({
  description,
  classId,
  inviteCode,
  inviteCodeExpiresAt,
  inviteCodeDisabled,
  announcements,
  currentUserId,
}: {
  description: string | null;
  classId: string;
  inviteCode: string;
  inviteCodeExpiresAt: string | null;
  inviteCodeDisabled: boolean;
  announcements: Awaited<ReturnType<typeof listAnnouncements>>;
  currentUserId: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {description && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              About this class
            </h3>
            <p className="whitespace-pre-wrap text-sm text-gray-700">{description}</p>
          </div>
        )}
        <StreamView
          classId={classId}
          announcements={announcements}
          currentUserId={currentUserId}
          isTeacher={true}
        />
      </div>
      <div className="lg:col-span-1">
        <InviteCodeStrip
          classId={classId}
          code={inviteCode}
          expiresAt={inviteCodeExpiresAt}
          disabled={inviteCodeDisabled}
        />
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