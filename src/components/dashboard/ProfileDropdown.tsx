// src/components/dashboard/ProfileDropdown.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, LogOut, Settings } from 'lucide-react'
import { getInitials } from '@/lib/utils/getInitials'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Profile } from '@/types/user'
import { cn } from '@/lib/utils/cn'

interface ProfileDropdownProps {
  profile: Profile
}

export default function ProfileDropdown({ profile }: ProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const initials = getInitials(profile.full_name)
  const displayName = profile.full_name || profile.email
  const email = profile.email
  const role = profile.role

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'profile-chip flex items-center gap-2.5 pl-1.5 pr-2.5 py-1.5 rounded-xl cursor-pointer',
          isOpen && 'is-open'
        )}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {/* Chip avatar */}
        <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt={displayName}
              crossOrigin="anonymous"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="avatar-gradient w-full h-full flex items-center justify-center text-white font-bold text-[13px]">
              {initials}
            </div>
          )}
        </div>

        <div className="hidden md:flex flex-col text-left leading-tight min-w-0">
          <p className="profile-chip-name text-[13px] font-semibold truncate max-w-[160px]">
            {displayName}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            <p className="profile-chip-email text-[11px] font-medium truncate max-w-[140px]">
              {email}
            </p>
            <span className="role-pill" aria-label={`Role: ${role}`}>
              {role}
            </span>
          </div>
        </div>

        <ChevronDown
          size={14}
          strokeWidth={2.2}
          className={cn(
            'text-foreground-subtle transition-transform duration-200 hidden md:block shrink-0',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div
          className="topnav-dropdown dropdown-surface absolute right-0 mt-2 w-[280px] rounded-2xl py-0 overflow-hidden z-50"
          role="menu"
        >
          {/* Header */}
          <div className="dropdown-header">
            <div className="flex items-center gap-3">
              {/* Dropdown-header avatar */}
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatar_url}
                    alt={displayName}
                    crossOrigin="anonymous"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="avatar-gradient w-full h-full flex items-center justify-center text-white font-bold text-sm">
                    {initials}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-foreground font-semibold text-sm truncate">{displayName}</p>
                <p className="text-foreground-subtle text-xs truncate mt-0.5">{email}</p>
              </div>
            </div>
            <div className="mt-3">
              <span className="role-badge">{role}</span>
            </div>
          </div>

          {/* Menu Items */}
          <div className="dropdown-section">
            <button
              className="dropdown-item"
              role="menuitem"
              onClick={() => {
                setIsOpen(false)
                router.push('/settings')
              }}
            >
              <Settings size={16} strokeWidth={2} className="dropdown-item-icon" />
              <span className="text-[13px] font-medium">Settings</span>
            </button>
          </div>

          {/* Logout */}
          <div className="dropdown-section-footer">
            <button onClick={handleSignOut} className="logout-item" role="menuitem">
              <LogOut size={16} strokeWidth={2} className="logout-icon" />
              <span className="text-[13px] font-semibold">Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}