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
          "flex items-center gap-3 p-1.5 pr-4 rounded-2xl transition-all duration-200",
          isOpen ? "bg-white/10" : "hover:bg-white/5"
        )}
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-red-600/20">
          {initials}
        </div>
        <div className="hidden md:block text-left">
          <p className="text-white text-[14px] font-bold leading-tight">{displayName}</p>
          <p className="text-slate-500 text-[12px] leading-tight mt-0.5">@{username}</p>
        </div>
        <ChevronDown 
          size={16} 
          className={cn("text-slate-500 transition-transform duration-200", isOpen && "rotate-180")} 
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-72 bg-[#161616] border border-white/10 rounded-2xl shadow-2xl py-2 overflow-hidden animate-in fade-in zoom-in duration-200">
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/5 bg-white/[0.02]">
            <p className="text-white font-bold text-sm">{displayName}</p>
            <p className="text-slate-500 text-xs truncate mt-0.5">{profile.email}</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="px-2.5 py-0.5 bg-red-600/10 text-red-500 text-[10px] font-black uppercase tracking-wider rounded-full border border-red-600/20">
                {profile.role}
              </span>
            </div>
          </div>

          {/* Menu Items */}
          <div className="p-2">
            <button className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all group">
              <User size={18} className="group-hover:scale-110 transition-transform" />
              <span className="text-sm font-semibold">My Profile</span>
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all group">
              <Settings size={18} className="group-hover:scale-110 transition-transform" />
              <span className="text-sm font-semibold">Settings</span>
            </button>
          </div>

          {/* Logout Action */}
          <div className="p-2 border-t border-white/5 bg-white/[0.01]">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-3 text-red-500 hover:bg-red-500/10 rounded-xl transition-all group"
            >
              <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm font-bold">Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}