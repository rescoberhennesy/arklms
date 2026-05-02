import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SidebarProvider } from '@/context/SidebarContext'
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
      <div className="flex min-h-screen bg-[#f5f5f5]">
        <Sidebar role={profile.role} />
        <div className="flex-1 flex flex-col">
          <TopNavbar profile={profile} />
          <main className="flex-1 p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  )
}