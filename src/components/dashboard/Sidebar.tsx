'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { useSidebar } from '@/context/SidebarContext'
import { navigationConfig } from '@/config/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { UserRole } from '@/types/user'
import { cn } from '@/lib/utils/cn'

interface SidebarProps {
  role: UserRole
  institutionName?: string
}

export default function Sidebar({ role, institutionName = 'Ark Learning Management System' }: SidebarProps) {
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
        'h-screen bg-slate-950 border-r border-slate-800 flex flex-col transition-all duration-300 sticky top-0',
        isCollapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Logo Header */}
      <div className="p-4 border-b border-slate-800 flex items-center gap-3">
        <div className="w-10 h-10 bg-red-600 rounded flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">ARK</span>
        </div>
        {!isCollapsed && (
          <div className="overflow-hidden">
            <p className="text-white font-bold text-sm leading-tight">Ark Learning</p>
            <p className="text-white font-bold text-sm leading-tight">Management System</p>
          </div>
        )}
      </div>

      {/* Nav Sections */}
      <nav className="flex-1 overflow-y-auto py-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            {!isCollapsed && (
              <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {section.title}
              </p>
            )}
            <ul className="space-y-1 px-3">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                        isActive
                          ? 'bg-red-600 text-white'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                        isCollapsed && 'justify-center'
                      )}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <Icon size={20} className="flex-shrink-0" />
                      {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Sign Out */}
      <div className="p-3 border-t border-slate-800">
        <button
          onClick={handleSignOut}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors w-full',
            isCollapsed && 'justify-center'
          )}
          title={isCollapsed ? 'Sign out' : undefined}
        >
          <LogOut size={20} className="flex-shrink-0" />
          {!isCollapsed && <span className="text-sm font-medium">Sign out</span>}
        </button>
      </div>
    </aside>
  )
}