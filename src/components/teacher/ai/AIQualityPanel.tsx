
// src/components/teacher/ai/AIQualityPanel.tsx
'use client';

import { useState } from 'react';
import {
  Sparkles,
  Loader2,
  X,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  Lightbulb,
  Languages,
} from 'lucide-react';
import type {
  LessonAnalysisDraft,
  CriterionScore,
} from '@/lib/ai/prompts/lessonAnalyzer';
import type { LessonMetrics } from '@/lib/ai/readability';

interface AIQualityPanelProps {
  lessonId: string;
  // Re-run the analyzer when the lesson body changes (parent passes a key
  // or sends a refreshSignal that we use only to reset internal state).
}

interface AnalyzeResponse {
  draft: LessonAnalysisDraft;
  metrics?: LessonMetrics;
  tokens?: { input: number; output: number };
  error?: string;
}

export default function AIQualityPanel({ lessonId }: AIQualityPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/ai/lesson/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId }),
      });
      const json = (await res.json()) as AnalyzeResponse;
      if (!res.ok) {
        setError(json.error || 'Failed to analyze lesson.');
      } else {
        setResult(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error.');
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    if (!result && !loading) runAnalysis();
  }

  function handleClose() {
    setOpen(false);
    setResult(null);
    setError(null);
  }

  // -------------------------------------------------------------------
  // Trigger button (when panel closed)
  // -------------------------------------------------------------------
  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Analyze quality
      </button>
    );
  }

  // -------------------------------------------------------------------
  // Panel
  // -------------------------------------------------------------------
  return (
    <section className="mt-4 rounded-xl border border-indigo-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-indigo-100 bg-indigo-50/50 px-4 py-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-900">
          <Sparkles className="h-4 w-4 text-indigo-600" />
          Lesson Quality Analysis
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={runAnalysis}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
            aria-label="Re-analyze"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Re-analyze
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="p-4">
        {loading && (
          <div className="flex items-center gap-2 py-6 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing lesson content...
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result?.draft.errorMessage && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{result.draft.errorMessage}</span>
          </div>
        )}

        {result && !result.draft.errorMessage && (
          <AnalysisReport draft={result.draft} metrics={result.metrics} />
        )}
      </div>
    </section>
  );
}

// ===========================================================================
// Report sub-component
// ===========================================================================

function AnalysisReport({
  draft,
  metrics,
}: {
  draft: LessonAnalysisDraft;
  metrics?: LessonMetrics;
}) {
  return (
    <div className="space-y-5">
      {/* Overall summary */}
      {draft.overallSummary && (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Overall
          </p>
          <p>{draft.overallSummary}</p>
        </div>
      )}

      {/* Three criteria */}
      <div className="space-y-3">
        {draft.objectiveClarity && (
          <CriterionCard
            icon={<BookOpen className="h-4 w-4" />}
            title="Learning Objective Clarity"
            criterion={draft.objectiveClarity}
          />
        )}
        {draft.exampleCoverage && (
          <CriterionCard
            icon={<Lightbulb className="h-4 w-4" />}
            title="Example Coverage"
            criterion={draft.exampleCoverage}
          />
        )}
        {draft.readingLevel && (
          <ReadingLevelCard
            readingLevel={draft.readingLevel}
            metrics={metrics}
          />
        )}
      </div>

      {/* Metrics footer */}
      {metrics && (
        <div className="border-t border-gray-100 pt-3 text-xs text-gray-500">
          <p>
            <strong>Stats:</strong> {metrics.stats.words} words ·{' '}
            {metrics.stats.sentences} sentences · Flesch reading ease{' '}
            <strong>{metrics.stats.fleschReadingEase}</strong> (
            {metrics.stats.readingLevelLabel})
            {metrics.likelyFilipino &&
              ' · Filipino/Taglish content detected — Flesch may not apply'}
          </p>
        </div>
      )}
    </div>
  );
}

function CriterionCard({
  icon,
  title,
  criterion,
}: {
  icon: React.ReactNode;
  title: string;
  criterion: CriterionScore;
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span className="text-indigo-600">{icon}</span>
          {title}
        </h3>
        <ScoreBadge score={criterion.score} />
      </div>
      <div className="space-y-2 text-sm">
        <div>
          <p className="mb-0.5 inline-flex items-center gap-1 text-xs font-semibold text-green-700">
            <CheckCircle2 className="h-3 w-3" />
            Strengths
          </p>
          <p className="text-gray-700">{criterion.strengths}</p>
        </div>
        <div>
          <p className="mb-0.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
            <Lightbulb className="h-3 w-3" />
            Suggestions
          </p>
          <p className="text-gray-700">{criterion.suggestions}</p>
        </div>
      </div>
    </div>
  );
}

function ReadingLevelCard({
  readingLevel,
  metrics,
}: {
  readingLevel: NonNullable<LessonAnalysisDraft['readingLevel']>;
  metrics?: LessonMetrics;
}) {
  if (!readingLevel.applicable) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Languages className="h-4 w-4 text-indigo-600" />
            Reading Level Appropriateness
          </h3>
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
            N/A
          </span>
        </div>
        <p className="text-sm text-gray-600">
          {readingLevel.note ||
            'Not applicable to this content type.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Languages className="h-4 w-4 text-indigo-600" />
          Reading Level Appropriateness
        </h3>
        {readingLevel.score && <ScoreBadge score={readingLevel.score} />}
      </div>
      {metrics && (
        <p className="mb-2 text-xs text-gray-500">
          Flesch reading ease:{' '}
          <strong>{metrics.stats.fleschReadingEase}</strong> (
          {metrics.stats.readingLevelLabel})
        </p>
      )}
      <div className="space-y-2 text-sm">
        {readingLevel.strengths && (
          <div>
            <p className="mb-0.5 inline-flex items-center gap-1 text-xs font-semibold text-green-700">
              <CheckCircle2 className="h-3 w-3" />
              Strengths
            </p>
            <p className="text-gray-700">{readingLevel.strengths}</p>
          </div>
        )}
        {readingLevel.suggestions && (
          <div>
            <p className="mb-0.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
              <Lightbulb className="h-3 w-3" />
              Suggestions
            </p>
            <p className="text-gray-700">{readingLevel.suggestions}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: 1 | 2 | 3 | 4 }) {
  const cfg: Record<
    1 | 2 | 3 | 4,
    { label: string; cls: string }
  > = {
    1: { label: '1 — Needs major work', cls: 'bg-red-100 text-red-800 border-red-200' },
    2: { label: '2 — Needs work', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
    3: { label: '3 — Good', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
    4: { label: '4 — Excellent', cls: 'bg-green-100 text-green-800 border-green-200' },
  };
  const c = cfg[score];
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${c.cls}`}
    >
      {c.label}
    </span>
  );
}
