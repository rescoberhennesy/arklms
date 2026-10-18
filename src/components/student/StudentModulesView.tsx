'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, FolderOpen } from 'lucide-react';
import { type ModuleWithLessons } from '@/lib/actions/modules';
import { type ModuleTerm, MODULE_TERMS, MODULE_TERM_LABELS } from '@/lib/types/modules';
import { cn } from '@/lib/utils/cn';

interface StudentModulesViewProps {
  classId: string;
  modules: ModuleWithLessons[];
}

const CARD = 'rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

function modulesForTerm(modules: ModuleWithLessons[], term: ModuleTerm) {
  return modules.filter((m) => m.term === term).sort((a, b) => a.display_order - b.display_order);
}

export default function StudentModulesView({ classId, modules }: StudentModulesViewProps) {
  // Students only see visible modules and published lessons. The database
  // already enforces this; filtering here too keeps the UI honest. Modules
  // with no published lessons yet are left out entirely.
  const visibleModules = modules
    .filter((m) => !m.is_hidden)
    .map((m) => ({ ...m, lessons: m.lessons.filter((l) => l.published) }))
    .filter((m) => m.lessons.length > 0);

  // Open on the first grading period that has something to show.
  const [activeTerm, setActiveTerm] = useState<ModuleTerm>(
    () => MODULE_TERMS.find((t) => visibleModules.some((m) => m.term === t)) ?? 'prelim',
  );

  if (visibleModules.length === 0) {
    return (
      <EmptyState
        title="No lessons yet"
        message="Your teacher hasn't published any lessons yet. Check back later."
      />
    );
  }

  const termModules = modulesForTerm(visibleModules, activeTerm);
  const termLabel = MODULE_TERM_LABELS[activeTerm];

  return (
    <div className="space-y-5">
      {/* Grading-period tabs */}
      <div
        role="tablist"
        aria-label="Grading period"
        className="inline-flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1"
      >
        {MODULE_TERMS.map((term) => {
          const active = term === activeTerm;
          return (
            <button
              key={term}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTerm(term)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm transition',
                active
                  ? 'bg-red-600 font-semibold text-white shadow-[0_4px_12px_rgba(220,38,38,0.25)]'
                  : 'font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900',
              )}
            >
              {MODULE_TERM_LABELS[term]}
            </button>
          );
        })}
      </div>

      {termModules.length === 0 ? (
        <EmptyState
          title={`No ${termLabel} lessons yet`}
          message={`Your teacher hasn't posted anything for ${termLabel} yet. Check back later.`}
        />
      ) : (
        <ol className="relative space-y-4">
          {/* Course path line */}
          <span aria-hidden="true" className="absolute bottom-6 left-5 top-6 w-px bg-zinc-200" />
          {termModules.map((module, i) => (
            <ModuleCard key={module.id} module={module} classId={classId} number={i + 1} />
          ))}
        </ol>
      )}
    </div>
  );
}

interface ModuleCardProps {
  module: ModuleWithLessons;
  classId: string;
  number: number;
}

function ModuleCard({ module, classId, number }: ModuleCardProps) {
  const [expanded, setExpanded] = useState(true);
  const count = module.lessons.length;

  return (
    <li className="relative flex gap-4">
      {/* Numbered marker */}
      <span
        aria-hidden="true"
        className={cn(
          'relative z-[1] mt-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-bold transition-colors',
          expanded ? 'border-red-200 bg-red-50 text-red-700' : 'border-zinc-200 bg-white text-zinc-600',
        )}
      >
        {String(number).padStart(2, '0')}
      </span>

      <article className={cn(CARD, 'min-w-0 flex-1 overflow-hidden')}>
        <header className="flex items-center gap-3 px-5 py-4">
          <div className="min-w-0 flex-1">
            <Link
              href={`/student/classes/${classId}/modules/${module.id}`}
              className="block truncate text-[15px] font-bold tracking-tight text-zinc-900 hover:text-red-700"
            >
              {module.title}
            </Link>
            <p className="mt-0.5 text-xs text-zinc-500">
              {count} {count === 1 ? 'item' : 'items'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
            aria-label={expanded ? 'Collapse module' : 'Expand module'}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
        </header>

        {expanded && (
          <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
            {module.lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link
                  href={`/student/classes/${classId}/lessons/${lesson.id}`}
                  className="group flex min-h-12 items-center gap-3 px-5 py-2.5 transition hover:bg-zinc-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 transition group-hover:bg-red-50 group-hover:text-red-600">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 group-hover:text-zinc-900">
                    {lesson.title}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </article>
    </li>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
      <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        <FolderOpen className="h-6 w-6" />
      </span>
      <h3 className="text-base font-bold text-zinc-900">{title}</h3>
      <p className="max-w-md text-sm text-zinc-500">{message}</p>
    </div>
  );
}