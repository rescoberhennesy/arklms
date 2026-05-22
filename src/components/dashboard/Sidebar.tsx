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
  /** Map of badgeKey → count. Items in navigationConfig whose
   *  `badgeKey` matches an entry here render a count badge.
   *  Counts of 0 render no badge. Counts > 99 render as "99+".
   *  Defaults to empty (no badges) — safe omission. */
  badgeCounts?: Record<string, number>
}

export default function Sidebar({ role, badgeCounts = {} }: SidebarProps) {
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

                const badgeValue =
                  item.badgeKey ? badgeCounts[item.badgeKey] ?? 0 : 0
                const showBadge = badgeValue > 0

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
                      <div className="relative flex-shrink-0">
                        <Icon
                          size={22}
                          className={cn(
                            'nav-icon transition-transform group-hover:scale-110',
                            isActive ? 'text-white' : 'text-slate-400',
                          )}
                        />
                        {/* Badge: rendered when this nav item has a badgeKey
                            AND the matching count is > 0. Anchored to the
                            icon so it works in both expanded and collapsed
                            sidebar states. When the nav item is active (red
                            background), we flip the badge to white-on-red so
                            it remains visible. */}
                        {showBadge && (
                          <span
                            className={cn(
                              'absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1',
                              'flex items-center justify-center rounded-full',
                              'text-[10px] font-bold ring-2',
                              isActive
                                ? 'bg-white text-red-600 ring-red-600'
                                : 'bg-red-600 text-white ring-[#0c0c0c]',
                            )}
                            aria-label={`${badgeValue} pending`}
                          >
                            {badgeValue > 99 ? '99+' : badgeValue}
                          </span>
                        )}
                      </div>
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