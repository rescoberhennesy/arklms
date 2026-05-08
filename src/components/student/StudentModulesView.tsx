'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Tag,
} from 'lucide-react';
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

const TERM_ACCENTS: Record<ModuleTerm, string> = {
  prelim: 'border-blue-200 text-blue-800 bg-blue-50',
  midterm: 'border-purple-200 text-purple-800 bg-purple-50',
  prefinal: 'border-amber-200 text-amber-800 bg-amber-50',
  final: 'border-rose-200 text-rose-800 bg-rose-50',
};

function groupByTerm(
  modules: ModuleWithLessons[],
): Record<ModuleTerm, ModuleWithLessons[]> {
  const groups: Record<ModuleTerm, ModuleWithLessons[]> = {
    prelim: [],
    midterm: [],
    prefinal: [],
    final: [],
  };
  for (const m of modules) groups[m.term].push(m);
  for (const t of MODULE_TERMS) {
    groups[t].sort((a, b) => a.display_order - b.display_order);
  }
  return groups;
}

export default function StudentModulesView({
  classId,
  modules,
}: StudentModulesViewProps) {
  // Hide modules with zero visible lessons (the teacher hasn't published
  // anything yet). Per Phase 7 decision: students don't see empty buckets.
  const visibleModules = modules.filter((m) => m.lessons.length > 0);

  if (visibleModules.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
        <p className="text-sm font-medium text-gray-700">No content yet</p>
        <p className="mt-1 text-xs text-gray-500">
          Your teacher hasn&apos;t published any lessons yet. Check back later.
        </p>
      </div>
    );
  }

  const grouped = groupByTerm(visibleModules);

  return (
    <div className="space-y-6">
      {MODULE_TERMS.map((term) => {
        const termModules = grouped[term];
        if (termModules.length === 0) return null;
        return (
          <section key={term}>
            <header className="mb-3 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${TERM_ACCENTS[term]}`}
              >
                <Tag className="h-3 w-3" />
                {MODULE_TERM_LABELS[term]}
              </span>
              <span className="text-xs text-gray-400">
                {termModules.length}{' '}
                {termModules.length === 1 ? 'module' : 'modules'}
              </span>
            </header>

            <div className="space-y-3">
              {termModules.map((module) => (
                <ModuleCard
                  key={module.id}
                  module={module}
                  classId={classId}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface ModuleCardProps {
  module: ModuleWithLessons;
  classId: string;
}

function ModuleCard({ module, classId }: ModuleCardProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <article className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <Link
          href={`/student/classes/${classId}/modules/${module.id}`}
          className="flex-1 truncate text-sm font-semibold text-gray-900 hover:text-red-600"
        >
          {module.title}
        </Link>

        <span className="text-xs text-gray-400">
          {module.lessons.length}{' '}
          {module.lessons.length === 1 ? 'lesson' : 'lessons'}
        </span>
      </header>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-3 py-2">
          <ul className="space-y-1">
            {module.lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link
                  href={`/student/classes/${classId}/lessons/${lesson.id}`}
                  className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 hover:bg-gray-50"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="flex-1 truncate text-sm text-gray-800">
                    {lesson.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}