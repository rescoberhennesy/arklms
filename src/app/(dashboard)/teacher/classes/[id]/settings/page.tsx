import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getClassById } from '@/lib/actions/classes';
import { InviteCodePanel } from '@/components/teacher/InviteCodePanel';
import SettingsActions from '@/components/teacher/SettingsActions';
import SetPageTitle from '@/components/dashboard/SetPageTitle';
import ClassColorPicker from '@/components/teacher/ClassColorPicker';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClassSettingsPage({ params }: PageProps) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const res = await getClassById(id);
  if (!res.ok) notFound();
  const klass = res.data;
  if (!klass) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6">
      <SetPageTitle title={klass.name} />

      <Link
        href={`/teacher/classes/${klass.id}`}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft size={16} />
        Back to class
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Class settings</h1>
        <p className="mt-1 text-sm text-gray-500">{klass.name}</p>
      </div>

     <SettingsSection
          title="Card color"
          description="Pick a color for this class. Shown on cards and the class header."
        >
          <ClassColorPicker
            classId={klass.id}
            initialColor={klass.color}
          />
        </SettingsSection>

      <SettingsSection
        title="Class invite"
        description="Manage the invite code and link students use to request to join."
      >
        <InviteCodePanel
          classId={klass.id}
          initialCode={klass.invite_code}
          initialExpiresAt={klass.invite_code_expires_at}
          initialDisabled={klass.invite_code_disabled}
        />
      </SettingsSection>

      <SettingsSection
        title="Danger zone"
        description="These actions affect the whole class. Some are permanent."
        tone="danger"
      >
        <SettingsActions
          classId={klass.id}
          className={klass.name}
          isArchived={klass.is_archived}
        />
      </SettingsSection>
    </div>
  );
}

function SettingsSection({
  title,
  description,
  tone = 'default',
  children,
}: {
  title: string;
  description: string;
  tone?: 'default' | 'danger';
  children: React.ReactNode;
}) {
  const isDanger = tone === 'danger';
  return (
    <section
      className={
        isDanger
          ? 'rounded-xl border border-red-200 bg-red-50/50 p-5'
          : 'rounded-xl border border-gray-200 bg-white p-5'
      }
    >
      <div className="mb-4">
        <h2
          className={
            isDanger
              ? 'text-base font-semibold text-red-900'
              : 'text-base font-semibold text-gray-900'
          }
        >
          {title}
        </h2>
        <p
          className={
            isDanger
              ? 'mt-0.5 text-sm text-red-700/80'
              : 'mt-0.5 text-sm text-gray-500'
          }
        >
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}
