// src/components/student/PracticeLandingView.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpenCheck,
  Plus,
  Search,
  Trash2,
  Trophy,
  Calendar,
  Hash,
  Sparkles,
} from 'lucide-react';
import type { PracticeSessionListItem } from '@/lib/types/practice';
import { PRACTICE_DIFFICULTY_LABELS } from '@/lib/types/practice';
import { deletePracticeSession } from '@/lib/actions/practice';
import PracticeGenerateModal from '@/components/student/PracticeGenerateModal';

interface ClassOption {
  id: string;
  name: string;
  color: string | null;
}

interface Props {
  sessions: PracticeSessionListItem[];
  classes: ClassOption[];
}

export default function PracticeLandingView({ sessions, classes }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = sessions.filter((s) =>
    s.title.toLowerCase().includes(query.toLowerCase()),
  );

  async function handleDelete(sessionId: string) {
    if (!confirm('Delete this practice session? This cannot be undone.')) return;
    setDeleting(sessionId);
    try {
      await deletePracticeSession(sessionId);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete session');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-red-50 p-2">
              <BookOpenCheck className="h-5 w-5 text-red-600" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">AI Practice</h1>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Generate practice questions from your lessons or your own notes. Retake as often as you like.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          <Sparkles className="h-4 w-4" />
          Generate new
        </button>
      </header>

      {sessions.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your practice sessions…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <BookOpenCheck className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 italic text-gray-500">
            {sessions.length === 0
              ? 'No practice sessions yet. Generate your first one above.'
              : 'No sessions match your search.'}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map((s) => {
            const scorePct =
              s.bestScore !== null && s.bestMaxScore && s.bestMaxScore > 0
                ? Math.round((s.bestScore / s.bestMaxScore) * 100)
                : null;

            return (
              <li
                key={s.id}
                className="group relative rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-red-200 hover:shadow-md"
              >
                <Link
                  href={`/student/practice/${s.id}`}
                  className="block space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 text-sm font-semibold text-gray-900">
                      {s.title}
                    </h3>
                    <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                      {PRACTICE_DIFFICULTY_LABELS[s.difficulty]}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      {s.questionCount} question{s.questionCount === 1 ? '' : 's'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                    {s.attemptCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        {s.attemptCount} attempt{s.attemptCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>

                  {scorePct !== null && (
                    <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-2 py-1.5 text-xs">
                      <Trophy className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="font-semibold text-emerald-700">
                        Best: {scorePct}%
                      </span>
                      <span className="text-emerald-600">
                        ({s.bestScore}/{s.bestMaxScore})
                      </span>
                    </div>
                  )}
                </Link>

                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  disabled={deleting === s.id}
                  aria-label="Delete session"
                  className="absolute right-3 top-3 rounded-md p-1.5 text-gray-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {modalOpen && (
        <PracticeGenerateModal
          classes={classes}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}