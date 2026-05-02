'use client'

import { Menu, Bell } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useSidebar } from '@/context/SidebarContext'
import ProfileDropdown from './ProfileDropdown'
import type { Profile } from '@/types/user'
import { cn } from '@/lib/utils/cn'

interface TopNavbarProps {
  profile: Profile
}

function getPageTitle(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  const last = segments[segments.length - 1] || 'Dashboard'
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, ' ')
}

export default function TopNavbar({ profile }: TopNavbarProps) {
  const { toggle } = useSidebar()
  const pathname = usePathname()
  const title = getPageTitle(pathname)

  return (
    <header className="h-24 bg-[#f5f5f5]/80 backdrop-blur-md border-b border-white/5 px-8 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-8">
        {/* Added extra margin-left (ml-2) and bigger gap to breathe near sidebar */}
        <button
          onClick={toggle}
          className="ml-2 text-slate-400 hover:text-white p-2.5 rounded-xl hover:bg-white/5 transition-all active:scale-95"
          aria-label="Toggle sidebar"
        >
          <Menu size={24} />
        </button>
        
        <div className="flex flex-col">
          <h1 className="text-black text-2xl font-bold tracking-tight">{title}</h1>
        
        </div>
      </div>

      <div className="flex items-center gap-6">
        <button
          className="text-slate-400 hover:text-white p-3 rounded-xl hover:bg-white/5 transition-all relative group"
          aria-label="Notifications"
        >
          <Bell size={24} className="group-hover:rotate-12 transition-transform" />
          <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-red-600 border-2 border-[#0c0c0c] rounded-full"></span>
        </button>

        {/* Separator Line */}
        <div className="h-8 w-[1px] bg-white/10 mx-2" />

        <ProfileDropdown profile={profile} />
      </div>
    </header>
  )
}