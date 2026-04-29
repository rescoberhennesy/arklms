'use client'

import { Menu, Bell } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useSidebar } from '@/context/SidebarContext'
import ProfileDropdown from './ProfileDropdown'
import type { Profile } from '@/types/user'

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
    <header className="bg-slate-950 border-b border-slate-800 px-6 py-3 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          className="text-slate-300 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-white text-xl font-semibold">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        <button
          className="text-slate-300 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition relative"
          aria-label="Notifications"
        >
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        <ProfileDropdown profile={profile} />
      </div>
    </header>
  )
}