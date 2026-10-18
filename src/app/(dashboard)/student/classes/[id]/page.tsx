import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, User } from 'lucide-react';
import { getStudentClassById } from '@/lib/actions/enrollments';
import LeaveClassButton from '@/components/student/LeaveClassButton';
import SetPageTitle from '@/components/dashboard/SetPageTitle';
import StreamView from '@/components/dashboard/StreamView';
import StudentModulesView from '@/components/student/StudentModulesView';
import StudentActivitiesTab from '@/components/student/StudentActivitiesTab';
import StudentProgressStrip from '@/components/student/StudentProgressStrip';
import StudentGradebookView from '@/components/student/StudentGradebookView';
import StudentPeopleTab from '@/components/student/StudentPeopleTab';
import { listAnnouncements } from '@/lib/actions/announcements';
import { listModulesWithLessons } from '@/lib/actions/modules';
import { listActivitiesForStudent } from '@/lib/actions/activities';
import { getStudentGradebookView } from '@/lib/actions/gradebook';
import { getClassPeople } from '@/lib/actions/classPeople';
import { createClient } from '@/lib/supabase/server';
import ClassCover from '@/components/dashboard/ClassCover';
import ClassMetaBadges from '@/components/dashboard/ClassMetaBadges';

export const dynamic = 'force-dynamic';

const TABS = ['stream', 'modules', 'activities', 'grades', 'people'] as const;
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

  if (!UUID_RE.test(id)) {
    redirect('/student/classes');
  }

  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? '')
    ? (tabParam as Tab)
    : 'stream';

  let klass;
  try {
    klass = await getStudentClassById(id);
  } catch {
    redirect('/student/classes');
  }

  if (!klass) {
    redirect('/student/classes');
  }

 

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

  let modules: Awaited<ReturnType<typeof listModulesWithLessons>> = [];
  if (tab === 'modules') {
    modules = await listModulesWithLessons(klass.id);
  }

  let activities: Awaited<ReturnType<typeof listActivitiesForStudent>> = [];
  if (tab === 'activities') {
    activities = await listActivitiesForStudent(klass.id);
  }

  let gradesView: Awaited<ReturnType<typeof getStudentGradebookView>> | null =
    null;
  if (tab === 'grades') {
    gradesView = await getStudentGradebookView(klass.id);
  }

  let peopleData: Awaited<ReturnType<typeof getClassPeople>> | null = null;
  if (tab === 'people') {
    peopleData = await getClassPeople(klass.id);
  }

  return (
    <div className="space-y-6">
      <SetPageTitle title={klass.name} />
      <Link
        href="/student/classes"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft size={16} />
        Back to classes
      </Link>

      <ClassCover
        url={klass.cover_photo_url}
        color={klass.color}
        className="rounded-xl px-6 py-6 text-white shadow-sm"
      >
        <div className="absolute right-4 top-4 z-10">
          <LeaveClassButton classId={klass.id} className={klass.name} />
        </div>
        <div className="relative">
          {/* Title — anchors the banner with the most visual weight */}
          <h1 className="text-3xl font-bold leading-tight drop-shadow-sm">
            {klass.name}
          </h1>

          {/* Metadata badges: section, grade level, track, semester */}
          <div className="mt-3">
            <ClassMetaBadges
              section={klass.section}
              gradeLevel={klass.grade_level}
              track={klass.track}
              semester={klass.semester}
            />
          </div>

          {/* Teacher attribution. Kept separate from the metadata badges
              because it's contextual info (who teaches), not structural
              info (what kind of class). Reads naturally as a subtitle. */}
          {klass.teacher_name && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-white/90 drop-shadow-sm">
              <User className="h-3.5 w-3.5 opacity-80" />
              <span>
                Teacher:{' '}
                <span className="font-semibold">{klass.teacher_name}</span>
              </span>
            </p>
          )}
        </div>
      </ClassCover>

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
        {tab === 'stream' && (
          <StreamTab
            description={klass.description}
            classId={klass.id}
            announcements={announcements}
            currentUserId={currentUserId}
          />
        )}
        {tab === 'modules' && (
          <StudentModulesView classId={klass.id} modules={modules} />
        )}
                {tab === 'activities' && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <div className="min-w-0">
              <StudentActivitiesTab classId={klass.id} activities={activities} />
            </div>
            <aside className="lg:sticky lg:top-4">
              <StudentProgressStrip classId={klass.id} activities={activities} />
            </aside>
          </div>
        )}
        {tab === 'grades' && gradesView && (
          <StudentGradebookView view={gradesView} />
        )}
        {tab === 'people' && peopleData && peopleData.ok && (
          <StudentPeopleTab people={peopleData.data} />
        )}
        {tab === 'people' && peopleData && !peopleData.ok && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            Failed to load people: {peopleData.error}
          </div>
        )}
      </div>
    </div>
  );
}

function StreamTab({
  description,
  classId,
  announcements,
  currentUserId,
}: {
  description: string | null;
  classId: string;
  announcements: Awaited<ReturnType<typeof listAnnouncements>>;
  currentUserId: string;
}) {
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
      <StreamView
        classId={classId}
        announcements={announcements}
        currentUserId={currentUserId}
        isTeacher={false}
      />
    </div>
  );
}