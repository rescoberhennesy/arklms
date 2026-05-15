// src/components/dashboard/QuickActionsRow.tsx
//
// Teacher-only quick-action tile row. Three tiles: Create Activity,
// Create Module, Announce. Each routes via a class-picker intermediate route.
//
// Student dashboard does not render this component at all.

import Link from 'next/link';
import {
  Plus,
  ClipboardList,
  BookOpen,
  Megaphone,
  type LucideIcon,
} from 'lucide-react';

interface ActionTile {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

const TILES: ActionTile[] = [
  {
    label: 'Create activity',
    description: 'Assignment or quiz',
    href: '/teacher/quick/activity',
    icon: ClipboardList,
  },
  {
    label: 'Create module',
    description: 'Group lessons together',
    href: '/teacher/quick/module',
    icon: BookOpen,
  },
  {
    label: 'Announce',
    description: 'Post to a class stream',
    href: '/teacher/quick/announce',
    icon: Megaphone,
  },
];

// Plus is imported but currently unused — keep the import so future
// "Create class" tile additions don't need to re-import. ESLint may warn;
// suppress via underscore alias:
const _unusedPlus = Plus;
void _unusedPlus;

export default function QuickActionsRow() {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Quick actions
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.label}
              href={tile.href}
              className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-5 shadow-sm transition hover:border-red-300 hover:bg-red-50/40 hover:shadow-md"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 transition group-hover:bg-red-100">
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 group-hover:text-red-700">
                  {tile.label}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {tile.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}