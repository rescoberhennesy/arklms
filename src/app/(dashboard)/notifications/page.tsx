import SetPageTitle from '@/components/dashboard/SetPageTitle';
import NotificationsPageView from '@/components/dashboard/NotificationsPageView';
import { listMyNotifications } from '@/lib/actions/notifications';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const initial = await listMyNotifications({ limit: 30 });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SetPageTitle title="Notifications" />
      <NotificationsPageView initial={initial} />
    </div>
  );
}