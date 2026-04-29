import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  Calendar,
  ClipboardList,
  FileText,
  type LucideIcon,
} from 'lucide-react'
import type { UserRole } from '@/types/user'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const navigationConfig: Record<UserRole, NavSection[]> = {
  admin: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
      ],
    },
    {
      title: 'Management',
      items: [
        { label: 'Teachers', href: '/admin/teachers', icon: Users },
        { label: 'Students', href: '/admin/students', icon: GraduationCap },
        { label: 'Sections', href: '/admin/sections', icon: BookOpen },
      ],
    },
  ],
  teacher: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', href: '/teacher/dashboard', icon: LayoutDashboard },
      ],
    },
    {
      title: 'Management',
      items: [
        { label: 'Classes', href: '/teacher/classes', icon: BookOpen },
        { label: 'Gradebook', href: '/teacher/gradebook', icon: ClipboardList },
        { label: 'Calendar', href: '/teacher/calendar', icon: Calendar },
      ],
    },
  ],
  student: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', href: '/student/dashboard', icon: LayoutDashboard },
      ],
    },
    {
      title: 'Learning',
      items: [
        { label: 'My Classes', href: '/student/classes', icon: BookOpen },
        { label: 'Assignments', href: '/student/assignments', icon: FileText },
      ],
    },
  ],
}