import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getMyProfile } from '@/lib/actions/profile';
import SetPageTitle from '@/components/dashboard/SetPageTitle';
import SettingsTabs from '@/components/dashboard/SettingsTabs';

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
          Manage your profile and account security.
        </p>
      </div>

      <SettingsTabs profile={profile} />
    </div>
  );
}