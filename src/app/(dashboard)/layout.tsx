import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SidebarProvider } from '@/context/SidebarContext'
import { PageTitleProvider } from '@/context/PageTitleContext'
import Sidebar from '@/components/dashboard/Sidebar'
import TopNavbar from '@/components/dashboard/TopNavbar'
import type { Profile } from '@/types/user'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>()

  if (!profile) redirect('/unauthorized')

  return (
    <SidebarProvider>
      <PageTitleProvider>
        <div data-app-shell className="flex min-h-screen bg-background">
          <Sidebar role={profile.role} />
          <div className="flex-1 flex flex-col min-w-0">
            <TopNavbar profile={profile} />
            <main className="flex-1 overflow-auto px-4 sm:px-6 py-6 lg:py-8">
              {children}
            </main>
          </div>
        </div>
      </PageTitleProvider>
    </SidebarProvider>
  )
}