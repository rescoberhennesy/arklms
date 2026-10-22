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
    <div className="space-y-6">
      {/* Grading-period tabs (same style as the teacher view) */}
      <div
        role="tablist"
        aria-label="Grading period"
        className="inline-flex flex-wrap gap-1 rounded-2xl bg-zinc-100 p-1"
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
                'inline-flex min-h-10 items-center rounded-xl px-5 text-sm transition',
                active
                  ? 'bg-white font-bold text-red-700 shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                  : 'font-semibold text-zinc-500 hover:text-zinc-900',
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
          {/* The path line connecting the numbered markers */}
          {termModules.length > 1 && (
            <span
              aria-hidden="true"
              className="absolute bottom-8 left-[23px] top-8 w-0.5 bg-zinc-200"
            />
          )}
          {termModules.map((module, i) => (
            <ModuleCard key={module.id} module={module} classId={classId} index={i} />
          ))}
        </ol>
      )}
    </div>
  );
}

interface ModuleCardProps {
  module: ModuleWithLessons;
  classId: string;
  index: number;
}

function ModuleCard({ module, classId, index }: ModuleCardProps) {
  const [expanded, setExpanded] = useState(true);
  const count = module.lessons.length;

  return (
    <li className="relative flex items-start gap-3 sm:gap-4">
      {/* Numbered marker on the path */}
      <span
        aria-hidden="true"
        className={cn(
          'relative z-[1] flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[15px] font-extrabold shadow-[0_0_0_6px_#faf8f7]',
          expanded
            ? 'border border-red-200 bg-red-50 text-red-700'
            : 'border border-zinc-200 bg-white text-zinc-600',
        )}
      >
        {String(index + 1).padStart(2, '0')}
      </span>

      <article className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]">
        <header className="flex items-center gap-3 px-3 py-3 sm:px-4">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-900"
            aria-label={expanded ? 'Collapse module' : 'Expand module'}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          <div className="min-w-0 flex-1">
            <Link
              href={`/student/classes/${classId}/modules/${module.id}`}
              className="block truncate text-base font-extrabold text-zinc-900 hover:text-red-600"
            >
              {module.title}
            </Link>
            <p className="mt-0.5 text-[12.5px] text-zinc-500">
              {count} {count === 1 ? 'lesson' : 'lessons'}
            </p>
          </div>
        </header>

        {expanded && (
          <div className="border-t border-zinc-100 px-2.5 pb-3 pt-2 sm:px-3">
            <ul className="space-y-1">
              {module.lessons.map((lesson) => (
                <li key={lesson.id}>
                  <Link
                    href={`/student/classes/${classId}/lessons/${lesson.id}`}
                    className="group flex min-h-14 items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-zinc-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                      <FileText className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-zinc-900 group-hover:text-red-600">
                      {lesson.title}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </li>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        <FolderOpen className="h-6 w-6" />
      </div>
      <h3 className="text-base font-bold text-zinc-900">{title}</h3>
      <p className="max-w-md text-sm text-zinc-600">{message}</p>
    </div>
  );
}