'use client';

// Listens for changes the current user is allowed to see (RLS applies)
// and refreshes the server-rendered page data. No full page reload.

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const TABLES = [
  'activities',
  'activity_submissions',
  'activity_grades',
  'quiz_attempts',
  'class_modules',
  'module_lessons',
  'class_announcements',
  'announcement_comments',
  'announcement_likes',
  'class_enrollments',
  'notifications',
  'flashcard_decks',
] as const;

export default function RealtimeRefresh() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const missedWhileHidden = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    // Bundle bursts of changes into one refresh.
    const scheduleRefresh = () => {
      if (document.visibilityState === 'hidden') {
        missedWhileHidden.current = true;
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 800);
    };

    let channel = supabase.channel('app-live-updates');
    for (const table of TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        scheduleRefresh,
      );
    }
    channel.subscribe();

    // Catch up once when the user comes back to the tab.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && missedWhileHidden.current) {
        missedWhileHidden.current = false;
        router.refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}