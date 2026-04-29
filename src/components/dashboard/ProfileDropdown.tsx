'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { getInitials } from '@/lib/utils/getInitials'
import type { Profile } from '@/types/user'

interface ProfileDropdownProps {
  profile: Profile
}

export default function ProfileDropdown({ profile }: ProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const initials = getInitials(profile.full_name)
  const displayName = profile.full_name || profile.email
  const username = profile.username || profile.email.split('@')[0]

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 hover:bg-slate-800 p-2 rounded-lg transition"
      >
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white font-semibold text-sm">
          {initials}
        </div>
        <div className="hidden md:block text-left">
          <p className="text-white text-sm font-medium leading-tight">{displayName}</p>
          <p className="text-slate-400 text-xs leading-tight">@{username}</p>
        </div>
        <ChevronDown size={16} className="text-slate-400 hidden md:block" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-2">
          <div className="px-4 py-3 border-b border-slate-700">
            <p className="text-white font-medium text-sm">{displayName}</p>
            <p className="text-slate-400 text-xs mt-0.5">{profile.email}</p>
            <span className="inline-block mt-2 px-2 py-0.5 bg-red-600/20 text-red-400 text-xs rounded capitalize">
              {profile.role}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}