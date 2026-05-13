// src/components/dashboard/NotificationBell.tsx
//
// Server component that fetches the dropdown data and hands it to the
// client-side dropdown component. This file is a thin wrapper — all UI
// behavior (open/close, mark-read clicks, navigation) lives in the
// client component NotificationBellClient below.

import { getNotificationDropdownData } from '@/lib/actions/notifications';
import NotificationBellClient from './NotificationBellClient';

export default async function NotificationBell() {
  const data = await getNotificationDropdownData();
  return <NotificationBellClient initialData={data} />;
}
