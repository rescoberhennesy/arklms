// src/components/dashboard/QuickActionsRow.tsx
//
// Teacher-only quick-action tile row. Four tiles: Create Class, Create
// Activity, Create Module, Announce. Each routes either directly (Create
// Class → existing modal flow via ?create=1) or via a class-picker
// intermediate route (the others).
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
  href: string;
  icon: LucideIcon;
}

const TILES: ActionTile[] = [
  { label: 'Create activity', href: '/teacher/quick/activity', icon: ClipboardList },
  { label: 'Create module', href: '/teacher/quick/module', icon: BookOpen },
  { label: 'Announce', href: '/teacher/quick/announce', icon: Megaphone },
];

export default function QuickActionsRow() {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Quick actions
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.label}
              href={tile.href}
              className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-5 text-center shadow-sm transition hover:border-red-300 hover:bg-red-50/40 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600 transition group-hover:bg-red-100">
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-slate-700 group-hover:text-red-700">
                {tile.label}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}