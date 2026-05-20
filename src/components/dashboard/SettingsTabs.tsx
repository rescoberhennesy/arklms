'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { User, Shield } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { Profile } from '@/types/user';
import ProfileForm from '@/components/dashboard/ProfileForm';
import SecurityPanel from '@/components/dashboard/SecurityPanel';

type Tab = 'profile' | 'security';

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
];

interface SettingsTabsProps {
  profile: Profile;
}

export default function SettingsTabs({ profile }: SettingsTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get('tab');
  const activeTab: Tab = raw === 'security' ? 'security' : 'profile';

  function setTab(next: Tab) {
    if (next === activeTab) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'profile') {
      // Default tab — keep the URL clean by omitting ?tab=profile.
      params.delete('tab');
    } else {
      params.set('tab', next);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="space-y-5">
      {/* Tab switcher */}
      <div
        className="flex gap-1 border-b border-gray-200"
        role="tablist"
        aria-label="Settings sections"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition -mb-px',
                isActive
                  ? 'border-red-600 text-red-700'
                  : 'border-transparent text-gray-600 hover:text-gray-900',
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'profile' ? (
        <ProfileForm profile={profile} />
      ) : (
        <SecurityPanel />
      )}
    </div>
  );
}