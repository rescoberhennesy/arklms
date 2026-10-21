'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

// Phones: the sidebar becomes a slide-out drawer below this width.
const MOBILE_QUERY = '(max-width: 767px)'

interface SidebarContextType {
  /** Desktop: icon-only mode */
  isCollapsed: boolean
  /** True on phone-sized screens */
  isMobile: boolean
  /** Phones: drawer is open */
  isMobileOpen: boolean
  /** ☰ button: opens/closes the drawer on phones, collapses/expands on desktop */
  toggle: () => void
  closeMobile: () => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  // Track screen size
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const update = () => {
      setIsMobile(mq.matches)
      if (!mq.matches) setIsMobileOpen(false)
    }
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Stop the page behind the drawer from scrolling while it's open
  useEffect(() => {
    if (!isMobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isMobileOpen])

  const toggle = useCallback(() => {
    if (window.matchMedia(MOBILE_QUERY).matches) {
      setIsMobileOpen((prev) => !prev)
    } else {
      setIsCollapsed((prev) => !prev)
    }
  }, [])

  const closeMobile = useCallback(() => setIsMobileOpen(false), [])

  return (
    <SidebarContext.Provider value={{ isCollapsed, isMobile, isMobileOpen, toggle, closeMobile }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}