'use client'
import { Menu, Bell } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useSidebar } from '@/context/SidebarContext'
import { usePageTitle } from '@/context/PageTitleContext'
import ProfileDropdown from './ProfileDropdown'
import type { Profile } from '@/types/user'

interface TopNavbarProps {
  profile: Profile
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Invite codes are 7 chars from a fixed alphabet; this catches them as
// "opaque tokens" so we don't title-case them in the topnav.
const INVITE_CODE_RE = /^[abcdefghjkmnpqrstuvwxyz23456789]{7}$/i

function isOpaqueSegment(segment: string): boolean {
  return UUID_RE.test(segment) || INVITE_CODE_RE.test(segment)
}

/**
 * Fallback title derivation when no page has set an explicit title via
 * <SetPageTitle/>. If the last segment looks like an opaque id (UUID or
 * invite code), fall back to the parent segment's title rather than
 * rendering the raw token.
 */
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
    <header className="h-24 bg-[#f5f5f5]/80 backdrop-blur-md border-b border-[#000000]/5 px-8 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-8">
        <button
          onClick={toggle}
          className="ml-2 text-slate-400 hover:text-[#000000] p-2.5 rounded-xl hover:bg-[#000000]/5 transition-all active:scale-95"
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
        <div className="h-8 w-[1px] bg-[#000000]/10 mx-2" />
        <ProfileDropdown profile={profile} />
      </div>
    </header>
  )
}
