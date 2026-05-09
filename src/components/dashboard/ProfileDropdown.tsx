'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, LogOut, User, Settings, Shield } from 'lucide-react'
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

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const initials = getInitials(profile.full_name)
  const displayName = profile.full_name || profile.email
  const username = profile.username || profile.email.split('@')[0]

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "profile-trigger flex items-center gap-3 pl-1.5 pr-3 py-1.5 rounded-2xl cursor-pointer",
          isOpen && "is-open"
        )}
      >
        <div className="avatar-gradient w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm">
          {initials}
        </div>
        <div className="hidden md:block text-left">
          <p className="text-gray-900 text-[13px] font-semibold leading-tight">{displayName}</p>
          <p className="text-gray-400 text-[11px] leading-tight mt-0.5 font-medium">@{username}</p>
        </div>
        <ChevronDown
          size={15}
          strokeWidth={2}
          className={cn(
            "text-gray-400 transition-transform duration-200 hidden md:block",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="topnav-dropdown dropdown-surface absolute right-0 mt-2.5 w-[280px] rounded-2xl py-0 overflow-hidden z-50">
          {/* Header */}
          <div className="dropdown-header">
            <p className="text-gray-900 font-semibold text-sm">{displayName}</p>
            <p className="text-gray-400 text-xs truncate mt-0.5">{profile.email}</p>
            <div className="mt-3">
              <span className="role-badge">{profile.role}</span>
            </div>
          </div>

          {/* Menu Items */}
          <div className="dropdown-section">
            <button className="dropdown-item">
              <User size={17} strokeWidth={1.8} className="dropdown-item-icon" />
              <span className="text-[13px] font-semibold">My Profile</span>
            </button>
            <button className="dropdown-item">
              <Settings size={17} strokeWidth={1.8} className="dropdown-item-icon" />
              <span className="text-[13px] font-semibold">Settings</span>
            </button>
          </div>

          {/* Logout */}
          <div className="dropdown-section-footer">
            <button
              onClick={handleSignOut}
              className="logout-item"
            >
              <LogOut size={17} strokeWidth={1.8} className="logout-icon" />
              <span className="text-[13px] font-bold">Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}