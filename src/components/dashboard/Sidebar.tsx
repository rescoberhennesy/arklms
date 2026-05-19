// src/components/dashboard/Sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSidebar } from '@/context/SidebarContext'
import { navigationConfig } from '@/config/navigation'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types/user'
import { cn } from '@/lib/utils/cn'
import './Sidebar.css'

interface SidebarProps {
  role: UserRole
}

export default function Sidebar({ role }: SidebarProps) {
  const { isCollapsed } = useSidebar()
  const pathname = usePathname()
  const router = useRouter()

  const sections = navigationConfig[role]

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <aside
      className={cn(
        'sidebar',
        'h-screen bg-[#0c0c0c] border-r border-white/5 flex flex-col transition-all duration-300 sticky top-0',
        isCollapsed ? 'collapsed w-20' : 'w-72',
      )}
    >
      {/* Institution Header */}
      <div className={cn('sidebar-header', 'p-8 mb-4')}>
        <div className="flex items-center gap-4">
          <div className="logo-container flex-shrink-0 overflow-hidden p-1 flex items-center justify-center">
            <img
              src="/Ark Logo.png"
              alt="Logo"
              className="logo-img w-full h-full object-contain"
            />
          </div>
          {!isCollapsed && (
            <div className="logo-text flex flex-col">
              <span className="text-white font-extrabold text-[13px] leading-tight tracking-tight uppercase">
                Ark Learning
              </span>
              <span className="text-white font-extrabold text-[13px] leading-tight tracking-tight uppercase">
                Management System
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="divider px-6 mb-8">
        <div className="h-[1px] bg-white/5 w-full" />
      </div>

      {/* Nav Sections */}
      <nav className={cn('sidebar-nav', 'flex-1 overflow-y-auto px-4')}>
        {sections.map((section) => (
          <div key={section.title} className="nav-section mb-10">
            {!isCollapsed && (
              <p className="section-label px-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-5">
                {section.title}
              </p>
            )}
            <ul className="space-y-3">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + '/')

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'nav-item',
                        'flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-200 group',
                        isActive
                          ? 'active bg-red-600 text-white shadow-lg shadow-red-600/20'
                          : 'text-slate-400 hover:bg-white/5 hover:text-white',
                        isCollapsed && 'justify-center',
                      )}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <Icon
                        size={22}
                        className={cn(
                          'nav-icon flex-shrink-0 transition-transform group-hover:scale-110',
                          isActive ? 'text-white' : 'text-slate-400',
                        )}
                      />
                      {!isCollapsed && (
                        <span className="nav-label text-[14px] font-semibold tracking-wide">
                          {item.label}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}