import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SidebarProvider } from '@/context/SidebarContext'
import { PageTitleProvider } from '@/context/PageTitleContext'
import Sidebar from '@/components/dashboard/Sidebar'
import TopNavbar from '@/components/dashboard/TopNavbar'
import NextTopLoader from 'nextjs-toploader'
import { getUnreadMessageCount } from '@/lib/actions/messages'
import NotificationBell from '@/components/dashboard/NotificationBell'
import RealtimeRefresh from '@/components/dashboard/RealtimeRefresh';
import MessagesButton from '@/components/dashboard/MessagesButton'
import { getTeacherUngradedCount } from '@/lib/actions/dashboard'
import type { Profile } from '@/types/user'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>()

  if (profileError) console.error('[layout] profile fetch failed:', profileError)
  if (!profile) redirect('/unauthorized')

  // Sidebar badge counts per role. Best-effort: any failure here
  // degrades to "no badge" rather than crashing the whole layout.
  // Keep this lightweight — it runs on every dashboard page navigation.
  let badgeCounts: Record<string, number> = {}
  if (profile.role === 'teacher') {
    try {
      const ungraded = await getTeacherUngradedCount()
      badgeCounts = { teacher_ungraded: ungraded }
    } catch (e) {
      console.error('[layout] teacher badge count failed:', e)
    }
  }

  // Messages shortcut lives in the top navbar (teacher + student only).
  const hasMessages = profile.role === 'teacher' || profile.role === 'student'
  let messagesUnread = 0
  if (hasMessages) {
    try {
      messagesUnread = await getUnreadMessageCount()
    } catch (e) {
      console.error('[layout] unread messages count failed:', e)
    }
  }

  return (
    <SidebarProvider>
      <NextTopLoader color="#b91c1c" height={3} showSpinner={false} />
      <PageTitleProvider>
        <div data-app-shell className="flex min-h-screen bg-background">
          <Sidebar role={profile.role} badgeCounts={badgeCounts} />
          <div className="flex-1 flex flex-col min-w-0">
            <TopNavbar
              profile={profile}
              bell={<NotificationBell />}
              messages={
                hasMessages ? (
                  <MessagesButton
                    href={`/${profile.role}/messages`}
                    unread={messagesUnread}
                  />
                ) : null
              }
            />
            <RealtimeRefresh />
            <main className="flex-1 overflow-auto px-4 sm:px-8 py-6 lg:py-8">
              {children}
            </main>
          </div>
        </div>
      </PageTitleProvider>
    </SidebarProvider>
  )
}