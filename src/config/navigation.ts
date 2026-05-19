// src/config/navigation.ts

import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  Calendar,
  MessageSquare,
  FolderOpen,
  ClipboardList,
  ClipboardCheck,
  BarChart3,
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
        { label: 'Calendar', href: '/teacher/calendar', icon: Calendar },
      ],
    },
    {
      title: 'Shortcuts',
      items: [
        { label: 'Modules', href: '/teacher/modules', icon: FolderOpen },
        { label: 'Activities', href: '/teacher/activities', icon: ClipboardList },
        { label: 'Grades', href: '/teacher/grades', icon: ClipboardCheck },
        { label: 'Analytics', href: '/teacher/analytics', icon: BarChart3 },
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
        { label: 'Calendar', href: '/student/calendar', icon: Calendar },
      ],
    },
  ],
}

// --------------------------------------------------------------------------
// CONTEXTUAL CLASS-DETAIL TABS
// Kept for export-compat. The Sidebar no longer renders these — the
// global Shortcuts items replaced the contextual sidebar approach.
// --------------------------------------------------------------------------

export interface ClassTabItem {
  tab: string
  label: string
  icon: LucideIcon
}

export const classTabs: Record<'teacher' | 'student', ClassTabItem[]> = {
  teacher: [
    { tab: 'stream', label: 'Stream', icon: MessageSquare },
    { tab: 'modules', label: 'Modules', icon: FolderOpen },
    { tab: 'activities', label: 'Activities', icon: ClipboardList },
    { tab: 'students', label: 'Students', icon: Users },
    { tab: 'grades', label: 'Grades', icon: GraduationCap },
    { tab: 'analytics', label: 'Analytics', icon: BarChart3 },
  ],
  student: [
    { tab: 'stream', label: 'Stream', icon: MessageSquare },
    { tab: 'modules', label: 'Modules', icon: FolderOpen },
    { tab: 'activities', label: 'Activities', icon: ClipboardList },
    { tab: 'grades', label: 'Grades', icon: GraduationCap },
    { tab: 'people', label: 'People', icon: Users },
  ],
}