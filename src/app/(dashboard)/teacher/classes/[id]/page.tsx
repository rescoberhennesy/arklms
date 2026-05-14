
// src/app/(dashboard)/teacher/classes/[id]/page.tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Settings } from 'lucide-react';
import { getClassById } from '@/lib/actions/classes';
import {
  listPendingJoinRequests,
  listClassRoster,
  countPendingJoinRequests,
} from '@/lib/actions/enrollments';
import { CopyButton } from '@/components/teacher/CopyButton';
import SetPageTitle from '@/components/dashboard/SetPageTitle';
import StreamView from '@/components/dashboard/StreamView';
import InviteCodeStrip from '@/components/teacher/InviteCodeStrip';
import { StudentsTab } from '@/components/teacher/StudentsTab';
import ModulesTab from '@/components/teacher/ModulesTab';
import ActivitiesTab from '@/components/teacher/ActivitiesTab';
import GradebookTab from '@/components/teacher/GradebookTab';
import AnalyticsTab from '@/components/teacher/AnalyticsTab';
import {
  getClassStudentStats,
  listActivitiesForAnalytics,
} from '@/lib/actions/analytics';
import { listAnnouncements } from '@/lib/actions/announcements';
import { listModulesWithLessons } from '@/lib/actions/modules';
import { listActivitiesForTeacher } from '@/lib/actions/activities';
import { getGradebookView } from '@/lib/actions/gradebook';
import { createClient } from '@/lib/supabase/server';
import ClassCover from '@/components/dashboard/ClassCover';

export const dynamic = 'force-dynamic';

const TABS = ['stream', 'modules', 'activities', 'students', 'grades', 'analytics'] as const;
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

// Pending-request count is fetched on EVERY tab so the Students tab can
  // show a badge -- otherwise the teacher wouldn't know there are pending
  // requests without opening that tab. Cheap: head:true count query.
  const pendingCount = await countPendingJoinRequests(klass.id);

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

  // Pre-fetch modules-tab data on the server when that tab is active
  let modules: Awaited<ReturnType<typeof listModulesWithLessons>> = [];
  if (tab === 'modules') {
    modules = await listModulesWithLessons(klass.id);
  }

  // Pre-fetch activities-tab data on the server when that tab is active.
  // Session 13: roster is also fetched here so the completion-tracking
  // "X of N submitted" rollup and inline missing-students expand on each
  // activity card can compute against the full enrolled list.
  let activities: Awaited<ReturnType<typeof listActivitiesForTeacher>> = [];
  let activitiesRoster: Awaited<ReturnType<typeof listClassRoster>> = [];
  if (tab === 'activities') {
    [activities, activitiesRoster] = await Promise.all([
      listActivitiesForTeacher(klass.id),
      listClassRoster(klass.id),
    ]);
  }

  // Pre-fetch gradebook-tab data on the server when that tab is active
  let gradebookView: Awaited<ReturnType<typeof getGradebookView>> | null = null;
  if (tab === 'grades') {
    gradebookView = await getGradebookView(klass.id);
  }

  // Pre-fetch analytics-tab data on the server when that tab is active
  let analyticsStats: Awaited<ReturnType<typeof getClassStudentStats>> | null = null;
  let analyticsActivities: Awaited<ReturnType<typeof listActivitiesForAnalytics>> = [];
  if (tab === 'analytics') {
    [analyticsStats, analyticsActivities] = await Promise.all([
      getClassStudentStats(klass.id),
      listActivitiesForAnalytics(klass.id),
    ]);
  }


  
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
      <ClassCover
        url={klass.cover_photo_url}
        color={klass.color}
        className="rounded-xl px-6 py-8 text-white shadow-sm"
      >
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
          
          </div>
        </div>
      </ClassCover>

      {/* Tabs */}
      <nav className="border-b border-gray-200">
        <div className="-mb-px flex gap-6 overflow-x-auto">
          {TABS.map((t) => {
            const isActive = t === tab;
            const showBadge = t === 'students' && pendingCount > 0;
            return (
              <Link
                key={t}
                href={`/teacher/classes/${id}?tab=${t}`}
                className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium capitalize transition ${
                  isActive
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
                }`}
              >
                {t}
                {showBadge && (
                  <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold leading-none text-white">
                    {pendingCount}
                  </span>
                )}
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
        {tab === 'modules' && (
          <ModulesTab classId={klass.id} initialModules={modules} />
        )}
        {tab === 'activities' && (
          <ActivitiesTab
            classId={klass.id}
            activities={activities}
            roster={activitiesRoster}
          />
        )}
        {tab === 'students' && (
          <StudentsTab
            classId={klass.id}
            initialPending={pendingRequests}
            initialRoster={roster}
          />
        )}
        {tab === 'grades' && gradebookView && (
          <GradebookTab view={gradebookView} classId={klass.id} />
        )}
        {tab === 'analytics' && analyticsStats && (
          <AnalyticsTab
            classId={klass.id}
            studentStats={analyticsStats}
            activities={analyticsActivities}
          />
        )}
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
