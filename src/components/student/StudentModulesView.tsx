'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, FolderOpen } from 'lucide-react';
import { type ModuleWithLessons } from '@/lib/actions/modules';
import {
  type ModuleTerm,
  MODULE_TERMS,
  MODULE_TERM_LABELS,
} from '@/lib/types/modules';

interface StudentModulesViewProps {
  classId: string;
  modules: ModuleWithLessons[];
}

function modulesForTerm(modules: ModuleWithLessons[], term: ModuleTerm) {
  return modules
    .filter((m) => m.term === term)
    .sort((a, b) => a.display_order - b.display_order);
}

export default function StudentModulesView({
  classId,
  modules,
}: StudentModulesViewProps) {
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
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <FolderOpen className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-gray-900">No lessons yet</h3>
        <p className="max-w-md text-sm text-gray-600">
          Your teacher hasn&apos;t published any lessons yet. Check back later.
        </p>
      </div>
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
        className="inline-flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1"
      >
        {MODULE_TERMS.map((term) => {
          const active = term === activeTerm;
          const count = visibleModules.filter((m) => m.term === term).length;
          return (
            <button
              key={term}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTerm(term)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm transition ${
                active
                  ? 'bg-red-600 font-semibold text-white'
                  : 'font-medium text-gray-700 hover:bg-gray-100'
              }`}
            >
              {MODULE_TERM_LABELS[term]}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  active ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {termModules.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
            <FolderOpen className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">
            No {termLabel} lessons yet
          </h3>
          <p className="max-w-md text-sm text-gray-600">
            Your teacher hasn&apos;t posted anything for {termLabel} yet. Check back later.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {termModules.map((module) => (
            <ModuleCard key={module.id} module={module} classId={classId} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ModuleCardProps {
  module: ModuleWithLessons;
  classId: string;
}

function ModuleCard({ module, classId }: ModuleCardProps) {
  const [expanded, setExpanded] = useState(true);
  const count = module.lessons.length;

  return (
    <article className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label={expanded ? 'Collapse module' : 'Expand module'}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </button>

        <Link
          href={`/student/classes/${classId}/modules/${module.id}`}
          className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900 hover:text-red-600"
        >
          {module.title}
        </Link>

        <span className="whitespace-nowrap text-sm text-gray-500">
          {count} {count === 1 ? 'lesson' : 'lessons'}
        </span>
      </header>

      {expanded && (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2 sm:pl-14">
          <ul className="space-y-0.5">
            {module.lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link
                  href={`/student/classes/${classId}/lessons/${lesson.id}`}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-gray-800 hover:bg-gray-50 hover:text-red-600"
                >
                  <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1 truncate text-sm">{lesson.title}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}