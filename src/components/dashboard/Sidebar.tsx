// src/components/dashboard/Sidebar.tsx
'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSidebar } from '@/context/SidebarContext'
import { navigationConfig } from '@/config/navigation'
import type { UserRole } from '@/types/user'
import { cn } from '@/lib/utils/cn'
import './Sidebar.css'

export interface SidebarUpcomingItem {
  id: string
  title: string
  /** e.g. the class name */
  subtitle?: string
  /** ISO date string */
  dueAt: string
  href: string
}

interface SidebarProps {
  role: UserRole
  /** Map of badgeKey → count. Items in navigationConfig whose
   *  `badgeKey` matches an entry here render a count badge.
   *  Counts of 0 render no badge. Counts > 99 render as "99+".
   *  Defaults to empty (no badges) — safe omission. */
  badgeCounts?: Record<string, number>
  /** e.g. "S.Y. 2026–2027" — chip is hidden when omitted. */
  termTitle?: string
  /** e.g. "1st Semester · Midterm" */
  termSubtitle?: string
  /** Next deadlines for the "Coming up" card — hidden when empty. */
  upcoming?: SidebarUpcomingItem[]
}

type Tip = { label: string; top: number; left: number }

export default function Sidebar({
  role,
  badgeCounts = {},
  termTitle,
  termSubtitle,
  upcoming = [],
}: SidebarProps) {
  const { isCollapsed } = useSidebar()
  const pathname = usePathname()
  const asideRef = useRef<HTMLElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)

  const sections = navigationConfig[role]

  // Floating label for the collapsed sidebar. Uses position: fixed so the
  // scrollable nav can't clip it.
  function showTip(el: HTMLElement, label: string) {
    if (!isCollapsed) return
    const r = el.getBoundingClientRect()
    const sidebarRight = asideRef.current?.getBoundingClientRect().right ?? r.right
    setTip({ label, top: r.top + r.height / 2, left: sidebarRight + 10 })
  }
  const hideTip = () => setTip(null)

  return (
    <aside ref={asideRef} className={cn('sidebar', isCollapsed && 'collapsed')}>
      {/* Institution header */}
      <div className="sidebar-header">
        <div className="logo-container">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Ark Logo.png"
            alt="ARK Technological Institute Education System Inc. logo"
            className="logo-img"
          />
        </div>
        {!isCollapsed && (
          <div className="logo-text">
            <span className="logo-title">ARK LMS</span>
            <span className="logo-subtitle">ARK Technological Institute Education System Inc.</span>
          </div>
        )}
      </div>

      {/* Term chip (only when data is provided) */}
      {!isCollapsed && termTitle && (
        <div className="sidebar-term">
          <span className="sidebar-term-title">{termTitle}</span>
          {termSubtitle && <span className="sidebar-term-sub">{termSubtitle}</span>}
        </div>
      )}

      {/* Nav sections */}
      <nav className="sidebar-nav" aria-label="Main" onScroll={hideTip}>
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
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

                const badgeValue = item.badgeKey ? badgeCounts[item.badgeKey] ?? 0 : 0
                const showBadge = badgeValue > 0
                const badgeText = badgeValue > 99 ? '99+' : String(badgeValue)
                const tipLabel = showBadge ? `${item.label} · ${badgeText}` : item.label

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn('nav-item', isActive && 'active')}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={isCollapsed ? tipLabel : undefined}
                      onMouseEnter={(e) => showTip(e.currentTarget, tipLabel)}
                      onMouseLeave={hideTip}
                      onFocus={(e) => showTip(e.currentTarget, tipLabel)}
                      onBlur={hideTip}
                    >
                      <span className="nav-icon-wrap">
                        <Icon size={20} strokeWidth={1.9} className="nav-icon" />
                        {showBadge && isCollapsed && (
                          <span className="nav-badge nav-badge--on-icon" aria-hidden="true">
                            {badgeText}
                          </span>
                        )}
                      </span>
                      {!isCollapsed && (
                        <>
                          <span className="nav-label">{item.label}</span>
                          {showBadge ? (
                            <span className="nav-badge" aria-label={`${badgeValue} pending`}>
                              {badgeText}
                            </span>
                          ) : (
                            isActive && <span className="nav-active-dot" aria-hidden="true" />
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

      {/* Coming up (only when there are deadlines) */}
      {!isCollapsed && upcoming.length > 0 && (
        <div className="sidebar-upcoming">
          <div className="sidebar-upcoming-head">
            <span>Coming up</span>
            <Link href={role === 'teacher' ? '/teacher/calendar' : `/${role}/calendar`}>See all</Link>
          </div>
          {upcoming.slice(0, 2).map((u, i) => {
            const d = new Date(u.dueAt)
            return (
              <Link key={u.id} href={u.href} className="upcoming-row">
                <span className="upcoming-date">
                  <span className={cn('upcoming-month', i === 0 && 'is-next')}>
                    {d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                  </span>
                  <span className="upcoming-day">{d.getDate()}</span>
                </span>
                <span className="upcoming-text">
                  <span className="upcoming-title">{u.title}</span>
                  {u.subtitle && <span className="upcoming-sub">{u.subtitle}</span>}
                </span>
              </Link>
            )
          })}
        </div>
      )}

      {/* Collapsed-mode label */}
      {isCollapsed && tip && (
        <div className="nav-tooltip" role="tooltip" style={{ top: tip.top, left: tip.left }}>
          {tip.label}
        </div>
      )}
    </aside>
  )
}