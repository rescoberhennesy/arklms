
// src/lib/ai/prompts/lessonAnalyzer.ts
//
// Prompt + response schema for the Lesson Content Quality Analyzer.
//
// Design (locked):
//   - Code (readability.ts) computes ALL numbers — Flesch score, word counts,
//     language flag. AI is given those numbers as inputs and is forbidden
//     from re-computing them.
//   - AI scores three criteria 1–4 and writes short strengths + suggestions
//     per criterion plus an overall narrative.
//   - For Filipino/Taglish content, the AI is told to mark
//     readingLevel.applicable=false and explain that the English Flesch
//     formula doesn't apply.
//
// Persistence pattern (matches analytics):
//   - ai_usage_log on success/error/rate_limited
//   - NO ai_generations row — this is a read-only diagnostic, not a
//     draft/publish flow.

import type { LessonMetrics } from '@/lib/ai/readability';

// ---------------------------------------------------------------------------
// Draft shape returned to the client
// ---------------------------------------------------------------------------

export interface CriterionScore {
  score: 1 | 2 | 3 | 4;   // 1 = needs major work, 4 = excellent
  strengths: string;       // 1–2 sentences
  suggestions: string;     // 1–2 sentences, ACTIONABLE
}

export interface ReadingLevelCriterion {
  applicable: boolean;     // false for Filipino/Taglish
  score?: 1 | 2 | 3 | 4;   // present when applicable
  strengths?: string;
  suggestions?: string;
  note?: string;           // present when not applicable (e.g., "Filipino content — Flesch not applied")
}

export interface LessonAnalysisDraft {
  // If the AI determines the lesson is too short / off-topic / unanalyzable,
  // it fills errorMessage and produces no scores.
  errorMessage?: string;
  overallSummary?: string;
  objectiveClarity?: CriterionScore;
  exampleCoverage?: CriterionScore;
  readingLevel?: ReadingLevelCriterion;
}

// ---------------------------------------------------------------------------
// System instruction
// ---------------------------------------------------------------------------

export const LESSON_ANALYZER_SYSTEM_INSTRUCTION = `
You are an instructional-design reviewer evaluating a single lesson's content
quality for a Philippine secondary/tertiary classroom LMS.

You evaluate THREE criteria, each scored 1–4:

  1. OBJECTIVE CLARITY — Does the lesson state what students will learn or
     be able to do? Look for explicit learning objectives, a "By the end of
     this lesson…" framing, or clear topic statement at the start. Implicit
     objectives buried in the middle score lower than explicit ones up top.

  2. EXAMPLE COVERAGE — Does the lesson include worked examples, applications,
     analogies, or concrete scenarios — or is it definition-heavy without
     showing the concept in use? A formula stated without an example scores
     low. A formula with one solved problem scores mid. Multiple varied
     examples with explanation score high.

  3. READING LEVEL APPROPRIATENESS — Is the Flesch reading-ease score we
     provided appropriate for the lesson's likely audience? The target
     audience for this LMS is Philippine SENIOR HIGH SCHOOL students
     (Grades 11–12). You will be given the score and word/sentence stats;
     do NOT compute or change them.
     For senior high school readers, the IDEAL Flesch band is roughly
     50–70 (corresponds to Grade 8–12 reading level — challenging but
     accessible). Above 80 may be too simplistic for the age group.
     Below 50 is increasingly dense and should be flagged for simplification.
     Below 30 is too dense to use as-is.
     IF the input flags "likelyFilipino": true, set applicable=false and
     write a brief note explaining that English-calibrated Flesch doesn't
     apply to Filipino/Taglish content.

SCORING SCALE:
  4 — Excellent: criterion fully met, no notable gaps
  3 — Good: mostly met with minor improvements possible
  2 — Needs work: partially met, clear gaps
  1 — Major issue: criterion largely unmet

MANDATORY OUTPUT (unless using the errorMessage escape hatch):
You MUST return ALL THREE criteria — objectiveClarity, exampleCoverage,
and readingLevel — plus overallSummary, in every response. Never omit a
criterion. If a criterion scores 1 because the lesson lacks that quality,
still write strengths (use "" empty string if truly none) and suggestions
explaining how to add it. Omitting a criterion is a hard error.

STYLE RULES:
- Be specific, not generic. "Add an example showing how to apply the
  Pythagorean theorem to a real triangle" beats "add more examples."
- Strengths: 1–2 sentences, factual.
- Suggestions: 1–2 sentences, ACTIONABLE (verbs: add, rephrase, move, define).
- Never invent statistics or claim things not visible in the lesson.
- Never re-compute the Flesch score or word counts.

ESCAPE HATCH:
If the lesson body is too short to evaluate (under ~50 plain words), or is
not actually a lesson (placeholder text, table of contents only, random
text), set errorMessage to a one-sentence explanation and omit the criterion
fields entirely.

Reply ONLY with JSON matching the provided schema.
`.trim();

// ---------------------------------------------------------------------------
// Response schema (Gemini structured output)
// ---------------------------------------------------------------------------

export const LESSON_ANALYZER_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    errorMessage: { type: 'string' },
    overallSummary: { type: 'string' },
    objectiveClarity: {
      type: 'object',
      properties: {
        score: { type: 'integer', minimum: 1, maximum: 4 },
        strengths: { type: 'string' },
        suggestions: { type: 'string' },
      },
      required: ['score', 'strengths', 'suggestions'],
    },
    exampleCoverage: {
      type: 'object',
      properties: {
        score: { type: 'integer', minimum: 1, maximum: 4 },
        strengths: { type: 'string' },
        suggestions: { type: 'string' },
      },
      required: ['score', 'strengths', 'suggestions'],
    },
    readingLevel: {
      type: 'object',
      properties: {
        applicable: { type: 'boolean' },
        score: { type: 'integer', minimum: 1, maximum: 4 },
        strengths: { type: 'string' },
        suggestions: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['applicable'],
    },
  },
  // Top-level required: unless errorMessage is set, ALL three criteria
  // plus overallSummary must be present. Gemini's responseSchema enforcement
  // is best-effort — the validator below double-checks at runtime.
  required: ['overallSummary', 'objectiveClarity', 'exampleCoverage', 'readingLevel'],
} as const;

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

export function buildLessonAnalyzerUserPrompt(input: {
  lessonTitle: string;
  lessonBody: string;
  metrics: LessonMetrics;
}): string {
  const { lessonTitle, lessonBody, metrics } = input;
  const { stats, likelyFilipino } = metrics;

  return `
Analyze this lesson. Score the three criteria per the system instructions.

LESSON TITLE: ${lessonTitle}

PRE-COMPUTED METRICS (do not recompute):
- Word count: ${stats.words}
- Sentence count: ${stats.sentences}
- Average words per sentence: ${stats.avgWordsPerSentence}
- Average syllables per word: ${stats.avgSyllablesPerWord}
- Flesch reading ease: ${stats.fleschReadingEase} (${stats.readingLevelLabel})
- Language flag: ${likelyFilipino ? 'likelyFilipino=true (skip Flesch criterion)' : 'likelyFilipino=false'}

LESSON BODY (markdown):
---
${lessonBody}
---

Reply ONLY with JSON matching the schema.
`.trim();
}

// ---------------------------------------------------------------------------
// Runtime validator
// ---------------------------------------------------------------------------

export function validateLessonAnalysisDraft(
  raw: unknown,
): LessonAnalysisDraft {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI returned non-object output');
  }
  const obj = raw as Record<string, unknown>;

  // Escape hatch
  if (typeof obj.errorMessage === 'string' && obj.errorMessage.trim()) {
    return { errorMessage: obj.errorMessage.trim() };
  }

  // Required: at least the three criteria when no errorMessage
  const errors: string[] = [];

  if (typeof obj.overallSummary !== 'string' || !obj.overallSummary.trim()) {
    errors.push('overallSummary missing');
  }

  const oc = obj.objectiveClarity as Record<string, unknown> | undefined;
  if (
    !oc ||
    !isScore(oc.score) ||
    typeof oc.strengths !== 'string' ||
    typeof oc.suggestions !== 'string'
  ) {
    errors.push('objectiveClarity malformed');
  }

  const ec = obj.exampleCoverage as Record<string, unknown> | undefined;
  if (
    !ec ||
    !isScore(ec.score) ||
    typeof ec.strengths !== 'string' ||
    typeof ec.suggestions !== 'string'
  ) {
    errors.push('exampleCoverage malformed');
  }

  const rl = obj.readingLevel as Record<string, unknown> | undefined;
  if (!rl || typeof rl.applicable !== 'boolean') {
    errors.push('readingLevel malformed');
  } else if (rl.applicable) {
    if (
      !isScore(rl.score) ||
      typeof rl.strengths !== 'string' ||
      typeof rl.suggestions !== 'string'
    ) {
      errors.push('readingLevel applicable but missing score/strengths/suggestions');
    }
  }

  if (errors.length > 0) {
    throw new Error(`AI output validation failed: ${errors.join('; ')}`);
  }

  return {
    overallSummary: (obj.overallSummary as string).trim(),
    objectiveClarity: {
      score: (oc!.score as 1 | 2 | 3 | 4),
      strengths: (oc!.strengths as string).trim(),
      suggestions: (oc!.suggestions as string).trim(),
    },
    exampleCoverage: {
      score: (ec!.score as 1 | 2 | 3 | 4),
      strengths: (ec!.strengths as string).trim(),
      suggestions: (ec!.suggestions as string).trim(),
    },
    readingLevel: rl!.applicable
      ? {
          applicable: true,
          score: rl!.score as 1 | 2 | 3 | 4,
          strengths: (rl!.strengths as string).trim(),
          suggestions: (rl!.suggestions as string).trim(),
        }
      : {
          applicable: false,
          note:
            typeof rl!.note === 'string' && rl!.note.trim()
              ? (rl!.note as string).trim()
              : 'Reading-level metric not applied to non-English content.',
        },
  };
}

function isScore(v: unknown): v is 1 | 2 | 3 | 4 {
  return v === 1 || v === 2 || v === 3 || v === 4;
}
