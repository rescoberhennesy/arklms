// src/components/dashboard/Sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSidebar } from '@/context/SidebarContext'
import { navigationConfig } from '@/config/navigation'
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

  const sections = navigationConfig[role]

  return (
    <aside className={cn('sidebar', isCollapsed && 'collapsed')}>
      {/* Institution header */}
      <div className="sidebar-header">
        <div className="logo-container">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Ark Logo.png"
            alt="ARK Technological Institute logo"
            className="logo-img"
          />
        </div>
        {!isCollapsed && (
          <div className="logo-text">
            <span className="logo-title">ARK LMS</span>
            <span className="logo-subtitle">Learning Management System</span>
          </div>
        )}
      </div>

      {/* Nav sections */}
      <nav className="sidebar-nav" aria-label="Main">
        {sections.map((section) => (
          <div key={section.title} className="nav-section">
            {isCollapsed ? (
              <div className="section-divider" aria-hidden="true" />
            ) : (
              <p className="section-label">{section.title}</p>
            )}
            <ul className="nav-list">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + '/')

                const badgeValue =
                  item.badgeKey ? badgeCounts[item.badgeKey] ?? 0 : 0
                const showBadge = badgeValue > 0
                const badgeText = badgeValue > 99 ? '99+' : String(badgeValue)

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn('nav-item', isActive && 'active')}
                      title={isCollapsed ? item.label : undefined}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="nav-icon-wrap">
                        <Icon size={20} strokeWidth={1.9} className="nav-icon" />
                        {showBadge && isCollapsed && (
                          <span
                            className="nav-badge nav-badge--on-icon"
                            aria-label={`${badgeValue} pending`}
                          >
                            {badgeText}
                          </span>
                        )}
                      </span>
                      {!isCollapsed && (
                        <>
                          <span className="nav-label">{item.label}</span>
                          {showBadge && (
                            <span
                              className="nav-badge"
                              aria-label={`${badgeValue} pending`}
                            >
                              {badgeText}
                            </span>
                          )}
                        </>
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