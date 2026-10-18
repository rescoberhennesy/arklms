// src/components/dashboard/QuickActionsRow.tsx
//
// Teacher-only quick-action tiles. Each routes via a class-picker route.

import Link from 'next/link';
import { ClipboardList, BookOpen, Megaphone, type LucideIcon } from 'lucide-react';

interface ActionTile {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

const TILES: ActionTile[] = [
  { label: 'Create activity', description: 'Activity or quiz', href: '/teacher/quick/activity', icon: ClipboardList },
  { label: 'Create module', description: 'Group lessons together', href: '/teacher/quick/module', icon: BookOpen },
  { label: 'Announce', description: 'Post to a class stream', href: '/teacher/quick/announce', icon: Megaphone },
];

export default function QuickActionsRow() {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-extrabold tracking-tight text-zinc-900">Quick actions</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.label}
              href={tile.href}
              className="group flex items-center gap-3.5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-zinc-300 hover:shadow-md"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 transition group-hover:bg-red-100">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-zinc-900 group-hover:text-red-700">{tile.label}</span>
                <span className="block truncate text-xs text-zinc-500">{tile.description}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}