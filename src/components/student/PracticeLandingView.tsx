// src/components/student/PracticeLandingView.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpenCheck, Search, Trash2, Calendar, Hash, Sparkles, ChevronRight } from 'lucide-react';
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

function scoreTone(pct: number) {
  if (pct >= 80) return { bar: 'bg-emerald-500', text: 'text-emerald-700' };
  if (pct >= 50) return { bar: 'bg-amber-500', text: 'text-amber-700' };
  return { bar: 'bg-red-500', text: 'text-red-700' };
}

export default function PracticeLandingView({ sessions, classes }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = sessions.filter((s) => s.title.toLowerCase().includes(query.toLowerCase()));

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
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
            <span className="h-2 w-2 rounded-full bg-red-600" />
            Study tools
          </p>
          <h1 className="mt-1.5 text-[28px] font-extrabold tracking-tight text-zinc-900">AI Practice</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Make practice questions from your lessons or your own notes. Retake as often as you like.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/20"
        >
          <Sparkles className="h-4 w-4" />
          Generate new
        </button>
      </header>

      {/* Search */}
      {sessions.length > 0 && (
        <label className="relative block">
          <span className="sr-only">Search practice sets</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your practice sets"
            className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-4 focus:ring-zinc-900/5"
          />
        </label>
      )}

      {/* List / empty */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100">
            <BookOpenCheck className="h-6 w-6 text-zinc-500" />
          </span>
          {sessions.length === 0 ? (
            <>
              <p className="text-[15px] font-bold text-zinc-900">No practice sets yet</p>
              <p className="max-w-sm text-sm text-zinc-500">
                Upload your notes or pick a lesson, and the AI will make questions with explanations for you.
              </p>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="mt-1 inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-bold text-white transition hover:bg-zinc-800"
              >
                <Sparkles className="h-4 w-4" />
                Make my first set
              </button>
            </>
          ) : (
            <p className="text-sm text-zinc-500">No practice sets match your search.</p>
          )}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => {
            const scorePct =
              s.bestScore !== null && s.bestMaxScore && s.bestMaxScore > 0
                ? Math.round((s.bestScore / s.bestMaxScore) * 100)
                : null;
            const tone = scorePct !== null ? scoreTone(scorePct) : null;

            return (
              <li
                key={s.id}
                className="group relative rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
              >
                <Link href={`/student/practice/${s.id}`} className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start gap-2 pr-8">
                    <h3 className="line-clamp-2 text-[15px] font-bold text-zinc-900">{s.title}</h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-[11px] font-bold text-white">
                      {PRACTICE_DIFFICULTY_LABELS[s.difficulty]}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-700">
                      <Hash className="h-3 w-3" />
                      {s.questionCount} question{s.questionCount === 1 ? '' : 's'}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-700">
                      <Calendar className="h-3 w-3" />
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="mt-auto border-t border-zinc-100 pt-3">
                    {scorePct !== null && tone ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500">
                            Best score · {s.attemptCount} attempt{s.attemptCount === 1 ? '' : 's'}
                          </span>
                          <span className={`font-extrabold ${tone.text}`}>{scorePct}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${scorePct}%` }} />
                        </div>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 transition group-hover:text-red-600">
                        Not taken yet · Start
                        <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                </Link>

                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  disabled={deleting === s.id}
                  aria-label="Delete practice set"
                  className="absolute right-3 top-3 rounded-lg p-1.5 text-zinc-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {modalOpen && <PracticeGenerateModal classes={classes} onClose={() => setModalOpen(false)} />}
    </div>
  );
}