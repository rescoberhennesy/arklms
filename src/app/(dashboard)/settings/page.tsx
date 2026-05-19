import Link from 'next/link';
import { ExternalLink, ShieldCheck, ChevronLeft } from 'lucide-react';
import { getMyProfile } from '@/lib/actions/profile';
import SetPageTitle from '@/components/dashboard/SetPageTitle';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const res = await getMyProfile();

  if (!res.ok) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load settings: {res.error}
      </div>
    );
  }

  const profile = res.data;

 return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <SetPageTitle title="Settings" />
      <Link
        href={`/${profile.role}/dashboard`}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft size={16} />
        Back to dashboard
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Your account and security information.
        </p>
      </div>

      {/* Account */}
      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Account
        </h2>
        <Row label="Name" value={profile.full_name ?? '—'} />
        <Row label="Email" value={profile.email} />
        <Row
          label="Role"
          value={profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
        />
        {profile.institution && (
          <Row label="Institution" value={profile.institution} />
        )}
      </section>

      {/* Password & Security */}
      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Password &amp; Security
          </h2>
        </div>
        <p className="text-sm text-gray-700">
          Your sign-in and password are managed by your organization through
          Microsoft. This app never stores or handles your password directly.
        </p>
        <p className="text-sm text-gray-700">
          To change or reset a forgotten password, use Microsoft&apos;s secure
          password portal. If self-service reset isn&apos;t available for your
          account, contact your institution&apos;s administrator.
        </p>
        <a
          href="https://aka.ms/sspr"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Reset password with Microsoft
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="truncate text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}