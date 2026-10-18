// src/components/teacher/CopyModulesModal.tsx
// "Copy from another class" for the Modules tab:
//   1) pick a class  2) tick modules / lessons  3) choose term  -> Copy
'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Copy as CopyIcon, Loader2, FileText, FolderOpen } from 'lucide-react';
import Modal from '@/components/shared/Modal';
import {
  listTeacherClassesForCopy,
  type TeacherClassForCopy,
} from '@/lib/actions/activities';
import {
  listModulesWithLessons,
  copyModulesFromClass,
  type ModuleWithLessons,
  type CopyModulesResult,
} from '@/lib/actions/modules';
import { type ModuleTerm, MODULE_TERMS, MODULE_TERM_LABELS } from '@/lib/types/modules';

interface Props {
  open: boolean;
  targetClassId: string;
  onClose: () => void;
}

type Selection = Record<string, Set<string>>; // moduleId -> selected lesson ids

export default function CopyModulesModal({ open, targetClassId, onClose }: Props) {
  const router = useRouter();
  const [classes, setClasses] = useState<TeacherClassForCopy[] | null>(null);
  const [sourceClass, setSourceClass] = useState<TeacherClassForCopy | null>(null);
  const [modules, setModules] = useState<ModuleWithLessons[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<Selection>({});
  const [targetTerm, setTargetTerm] = useState<ModuleTerm | 'same'>('same');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CopyModulesResult | null>(null);
  const [copying, startCopy] = useTransition();

  // Reset + load classes on open
  useEffect(() => {
    if (!open) return;
    setSourceClass(null);
    setModules(null);
    setSelection({});
    setTargetTerm('same');
    setError(null);
    setResult(null);
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await listTeacherClassesForCopy();
        if (!cancelled) setClasses(rows.filter((c) => c.classId !== targetClassId));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load classes.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, targetClassId]);

  async function pickClass(c: TeacherClassForCopy) {
    setSourceClass(c);
    setModules(null);
    setSelection({});
    setError(null);
    setLoading(true);
    try {
      setModules(await listModulesWithLessons(c.classId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load modules.');
    } finally {
      setLoading(false);
    }
  }

  function toggleModule(m: ModuleWithLessons) {
    setSelection((prev) => {
      const next = { ...prev };
      if (next[m.id]) delete next[m.id];
      else next[m.id] = new Set(m.lessons.map((l) => l.id));
      return next;
    });
  }

  function toggleLesson(m: ModuleWithLessons, lessonId: string) {
    setSelection((prev) => {
      const next = { ...prev };
      const set = new Set(next[m.id] ?? []);
      if (set.has(lessonId)) set.delete(lessonId);
      else set.add(lessonId);
      next[m.id] = set; // module stays selected even with 0 lessons
      return next;
    });
  }

  const counts = useMemo(() => {
    const ids = Object.keys(selection);
    return {
      modules: ids.length,
      lessons: ids.reduce((acc, id) => acc + selection[id].size, 0),
    };
  }, [selection]);

  function handleCopy() {
    setError(null);
    startCopy(async () => {
      try {
        const res = await copyModulesFromClass({
          targetClassId,
          targetTerm,
          selections: Object.entries(selection).map(([moduleId, set]) => ({
            moduleId,
            lessonIds: [...set],
          })),
        });
        setResult(res);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Copy failed.');
      }
    });
  }

  const title = result
    ? 'Copied!'
    : sourceClass
      ? `Modules in ${sourceClass.name}`
      : 'Copy modules from another class';

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={copying}
      size="max-w-2xl"
      title={
        <span className="flex items-center gap-2">
          {sourceClass && !result && (
            <button
              type="button"
              onClick={() => {
                setSourceClass(null);
                setModules(null);
                setSelection({});
              }}
              disabled={copying}
              aria-label="Back to classes"
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {title}
        </span>
      }
    >
      {/* ---------- Result ---------- */}
      {result ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            <p className="font-semibold">
              Copied {result.modules} module{result.modules === 1 ? '' : 's'} and {result.lessons} lesson
              {result.lessons === 1 ? '' : 's'}
            </p>
            <p className="mt-1 text-xs">
              {result.files} file{result.files === 1 ? '' : 's'} and {result.decks} flashcard deck
              {result.decks === 1 ? '' : 's'} included.
            </p>
          </div>
          <p className="text-sm text-gray-600">
            The copies are <strong>hidden from students</strong>. Review them, show the module, and publish
            each lesson when you&apos;re ready.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Done
            </button>
          </div>
        </div>
      ) : !sourceClass ? (
        /* ---------- Step 1: classes ---------- */
        <div className="space-y-2">
          {loading && (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading classes…
            </p>
          )}
          {classes && classes.length === 0 && !loading && (
            <p className="py-6 text-center text-sm italic text-gray-500">
              You don&apos;t teach any other classes to copy from.
            </p>
          )}
          {classes?.map((c) => (
            <button
              key={c.classId}
              type="button"
              onClick={() => pickClass(c)}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left hover:border-red-300 hover:bg-red-50/30"
            >
              <span>
                <span className="block text-sm font-medium text-gray-900">{c.name}</span>
                {c.section && <span className="text-xs text-gray-500">Section {c.section}</span>}
              </span>
            </button>
          ))}
        </div>
      ) : (
        /* ---------- Step 2: modules + lessons ---------- */
        <div className="space-y-4">
          {loading && (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading modules…
            </p>
          )}
          {modules && modules.length === 0 && !loading && (
            <p className="py-6 text-center text-sm italic text-gray-500">This class has no modules.</p>
          )}

          {modules && modules.length > 0 && (
            <div className="max-h-[45vh] space-y-4 overflow-y-auto pr-1">
              {MODULE_TERMS.map((term) => {
                const inTerm = modules.filter((m) => m.term === term);
                if (inTerm.length === 0) return null;
                return (
                  <div key={term}>
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      {MODULE_TERM_LABELS[term]}
                    </p>
                    <ul className="space-y-2">
                      {inTerm.map((m) => {
                        const sel = selection[m.id];
                        const allChecked = !!sel && sel.size === m.lessons.length;
                        return (
                          <li key={m.id} className="rounded-lg border border-gray-200 bg-white">
                            <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
                              <input
                                type="checkbox"
                                checked={!!sel}
                                ref={(el) => {
                                  if (el) el.indeterminate = !!sel && !allChecked && m.lessons.length > 0;
                                }}
                                onChange={() => toggleModule(m)}
                                className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                              />
                              <FolderOpen className="h-4 w-4 text-gray-400" />
                              <span className="flex-1 text-sm font-semibold text-gray-900">{m.title}</span>
                              <span className="text-xs text-gray-500">
                                {m.lessons.length} lesson{m.lessons.length === 1 ? '' : 's'}
                              </span>
                            </label>
                            {m.lessons.length > 0 && (
                              <ul className="space-y-1 border-t border-gray-100 px-3 py-2 pl-9">
                                {m.lessons.map((l) => (
                                  <li key={l.id}>
                                    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                                      <input
                                        type="checkbox"
                                        checked={!!sel?.has(l.id)}
                                        onChange={() => toggleLesson(m, l.id)}
                                        className="h-3.5 w-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                      />
                                      <FileText className="h-3.5 w-3.5 text-gray-400" />
                                      <span className="truncate">{l.title}</span>
                                    </label>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {modules && modules.length > 0 && (
            <div>
              <label htmlFor="copy-term" className="mb-1 block text-xs font-semibold text-gray-700">
                Put them in
              </label>
              <select
                id="copy-term"
                value={targetTerm}
                onChange={(e) => setTargetTerm(e.target.value as ModuleTerm | 'same')}
                disabled={copying}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                <option value="same">Same term as the original</option>
                {MODULE_TERMS.map((t) => (
                  <option key={t} value={t}>
                    {MODULE_TERM_LABELS[t]}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-gray-500">
                Lesson content, files and flashcards are copied. Copies start hidden from students.
              </p>
            </div>
          )}

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <span className="text-xs text-gray-500">
              {counts.modules} module{counts.modules === 1 ? '' : 's'} · {counts.lessons} lesson
              {counts.lessons === 1 ? '' : 's'} selected
            </span>
            <button
              type="button"
              onClick={handleCopy}
              disabled={copying || counts.modules === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CopyIcon className="h-4 w-4" />}
              {copying ? 'Copying…' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}