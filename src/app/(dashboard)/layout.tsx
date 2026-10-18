import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SidebarProvider } from '@/context/SidebarContext'
import { PageTitleProvider } from '@/context/PageTitleContext'
import Sidebar from '@/components/dashboard/Sidebar'
import TopNavbar from '@/components/dashboard/TopNavbar'
import NotificationBell from '@/components/dashboard/NotificationBell'
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

  // Fetch sidebar badge counts per role. Best-effort: any failure here
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

  return (
    <SidebarProvider>
      <PageTitleProvider>
        <div data-app-shell className="flex min-h-screen bg-background">
          <Sidebar role={profile.role} badgeCounts={badgeCounts} />
          <div className="flex-1 flex flex-col min-w-0">
            <TopNavbar profile={profile} bell={<NotificationBell />} />
            <main className="flex-1 overflow-auto px-4 sm:px-8 py-6 lg:py-8">
              {children}
            </main>
          </div>
        </div>
      </PageTitleProvider>
    </SidebarProvider>
  )
}