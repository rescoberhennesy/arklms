import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { previewClassByCode } from '@/lib/actions/joinPreview';
import JoinConfirmCard from '@/components/student/JoinConfirmCard';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function JoinByCodePage({ params }: PageProps) {
  const { code } = await params;

  // Auth gate — bounce to landing with `next` param so callback returns here
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Defensive only — middleware redirects unauthenticated users for /join/* to /?next=...
    // before this page renders. This block is fallback for any future edge case.
    redirect(`/?next=${encodeURIComponent(`/join/${code}`)}`);
  }

  // Role gate — fetch role, show role-appropriate error for non-students
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role;
  if (role !== 'student') {
    return <NonStudentBlocked role={role ?? null} />;
  }

  // Preview the class — read-only, no row inserted
  let preview;
  try {
    preview = await previewClassByCode(code);
  } catch (err) {
    return (
      <ErrorCard
        title="Could not load invite"
        message={err instanceof Error ? err.message : 'Unknown error'}
      />
    );
  }

  switch (preview.status) {
    case 'not_found':
      return (
        <ErrorCard
          title="Invite code not found"
          message="This code doesn't match any class. Double-check the link with your teacher."
        />
      );
    case 'disabled':
      return (
        <ErrorCard
          title="Invite code disabled"
          message={`The teacher has disabled the invite code for ${preview.class_name ?? 'this class'}.`}
        />
      );
    case 'expired':
      return (
        <ErrorCard
          title="Invite code expired"
          message={`The invite code for ${preview.class_name ?? 'this class'} has expired. Ask the teacher for a new link.`}
        />
      );
    case 'already_enrolled':
      return (
        <InfoCard
          title="You're already enrolled"
          message={`You're already a student in ${preview.class_name ?? 'this class'}.`}
          primaryHref={
            preview.class_id ? `/student/classes/${preview.class_id}` : '/student/classes'
          }
          primaryLabel="Open class"
        />
      );
    case 'request_pending':
      return (
        <InfoCard
          title="Request already pending"
          message={`Your request to join ${preview.class_name ?? 'this class'} is waiting for teacher approval.`}
          primaryHref="/student/classes"
          primaryLabel="View pending requests"
        />
      );
    case 'valid':
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Join a class</h1>
            <p className="mt-1 text-sm text-gray-600">
              Review the details below and confirm to send a join request.
            </p>
          </div>
          <JoinConfirmCard
            code={code}
            className={preview.class_name ?? '(unnamed class)'}
            classSection={preview.class_section}
            classSemester={preview.class_semester}
            classColor={preview.class_color}
            teacherName={preview.teacher_name}
          />
        </div>
      );
    default:
      return (
        <ErrorCard
          title="Unknown invite status"
          message="Something unexpected happened. Try again or contact your teacher."
        />
      );
  }
}

function NonStudentBlocked({ role }: { role: string | null }) {
  const dashboardHref =
    role === 'admin'
      ? '/admin/dashboard'
      : role === 'teacher'
        ? '/teacher/dashboard'
        : '/';
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h1 className="text-base font-semibold text-amber-900">
          Only students can join classes
        </h1>
        <p className="mt-1 text-sm text-amber-800">
          You&apos;re signed in as a {role ?? 'user without a role'}. Class
          invite links are for student accounts.
        </p>
      </div>
      <Link
        href={dashboardHref}
        className="inline-block rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
      >
        Back to my dashboard
      </Link>
    </div>
  );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <h1 className="text-base font-semibold text-red-900">{title}</h1>
        <p className="mt-1 text-sm text-red-800">{message}</p>
      </div>
      <Link
        href="/student/dashboard"
        className="inline-block rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

function InfoCard({
  title,
  message,
  primaryHref,
  primaryLabel,
}: {
  title: string;
  message: string;
  primaryHref: string;
  primaryLabel: string;
}) {
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
        <h1 className="text-base font-semibold text-blue-900">{title}</h1>
        <p className="mt-1 text-sm text-blue-800">{message}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href={primaryHref}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          {primaryLabel}
        </Link>
        <Link
          href="/student/dashboard"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}