'use client'

import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useSidebar } from '@/context/SidebarContext'
import { usePageTitle } from '@/context/PageTitleContext'
import ProfileDropdown from './ProfileDropdown'
import type { Profile } from '@/types/user'
import './TopNavbar.css'

interface TopNavbarProps {
  profile: Profile
  // The bell is fetched server-side in the layout and passed in as JSX
  // so we keep this component a pure client component (it uses useSidebar
  // and other client hooks) without forcing the bell to client-fetch too.
  bell?: React.ReactNode
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

export default function TopNavbar({ profile, bell }: TopNavbarProps) {
  const { toggle } = useSidebar()
  const pathname = usePathname()
  const { title: explicitTitle } = usePageTitle()
  const title = explicitTitle ?? getFallbackTitle(pathname)

  return (
    <header className="topnav-glass h-16 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Left cluster */}
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <button
          onClick={toggle}
          className="menu-btn p-2 rounded-lg shrink-0"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} strokeWidth={2} />
        </button>
        <div className="topnav-divider hidden sm:block" />
        <h1 className="topnav-title text-[15px] sm:text-base font-semibold tracking-tight truncate">
          {title}
        </h1>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {bell}
        <div className="topnav-divider mx-1" />
        <ProfileDropdown profile={profile} />
      </div>
    </header>
  )
}
