'use client'
import { Menu, Bell } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useSidebar } from '@/context/SidebarContext'
import { usePageTitle } from '@/context/PageTitleContext'
import ProfileDropdown from './ProfileDropdown'
import type { Profile } from '@/types/user'
import './TopNavbar.css'

interface TopNavbarProps {
  profile: Profile
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INVITE_CODE_RE = /^[abcdefghjkmnpqrstuvwxyz23456789]{7}$/i

function isOpaqueSegment(segment: string): boolean {
  return UUID_RE.test(segment) || INVITE_CODE_RE.test(segment)
}

function getFallbackTitle(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return 'Dashboard'

  const last = segments[segments.length - 1]
  const titleSegment =
    isOpaqueSegment(last) && segments.length >= 2
      ? segments[segments.length - 2]
      : last

  return titleSegment.charAt(0).toUpperCase() + titleSegment.slice(1).replace(/-/g, ' ')
}

export default function TopNavbar({ profile }: TopNavbarProps) {
  const { toggle } = useSidebar()
  const pathname = usePathname()
  const { title: explicitTitle } = usePageTitle()
  const title = explicitTitle ?? getFallbackTitle(pathname)

  return (
    <header className="topnav-glass h-[72px] px-6 lg:px-8 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-5">
        <button
          onClick={toggle}
          className="menu-btn p-2.5 rounded-xl"
          aria-label="Toggle sidebar"
        >
          <Menu size={22} strokeWidth={1.8} />
        </button>

        <h1 className="text-gray-900 text-[22px] font-bold tracking-[-0.02em] select-none">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="bell-btn p-2.5 rounded-xl"
          aria-label="Notifications"
        >
          <Bell size={21} strokeWidth={1.8} className="bell-icon" />
          <span className="notification-badge absolute top-[9px] right-[9px] w-[9px] h-[9px] bg-red-500 border-[2.5px] border-white rounded-full" />
        </button>

        <div className="topnav-divider mx-2" />

        <ProfileDropdown profile={profile} />
      </div>
    </header>
  )
}