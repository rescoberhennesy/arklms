// src/lib/types/practice.ts
//
// Pure types + constants for AI Practice. No async functions, no
// server-only code. Mirrors the practice_* tables created in the
// 20260522... practice_sessions migration.
//
// Question shapes deliberately reuse the existing QuestionConfig and
// QuestionAnswer types from quizzes.ts — practice supports the same 4
// auto-gradable kinds and we want the grading helpers to apply unchanged.

import type {
  McSingleConfig,
  McMultiConfig,
  TrueFalseConfig,
  ShortAnswerConfig,
  QuestionAnswer,
} from '@/lib/types/quizzes';

// ==========================================================================
// ENUMS (mirror of DB enums)
// ==========================================================================

export const PRACTICE_SOURCE_KINDS = ['lesson', 'upload'] as const;
export type PracticeSourceKind = (typeof PRACTICE_SOURCE_KINDS)[number];

export const PRACTICE_DIFFICULTIES = [
  'easy',
  'medium',
  'hard',
  'mixed',
] as const;
export type PracticeDifficulty = (typeof PRACTICE_DIFFICULTIES)[number];

export const PRACTICE_DIFFICULTY_LABELS: Record<PracticeDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  mixed: 'Mixed',
};

// Restricted subset of quiz_questions kinds — only the auto-gradable ones.
export const PRACTICE_QUESTION_KINDS = [
  'mc_single',
  'mc_multi',
  'true_false',
  'short_answer',
] as const;
export type PracticeQuestionKind = (typeof PRACTICE_QUESTION_KINDS)[number];

// Display labels follow the same convention as the quiz UI:
// "short_answer" renders as "Identification" everywhere.
export const PRACTICE_QUESTION_KIND_LABELS: Record <
  PracticeQuestionKind,
  string
> = {
  mc_single: 'Multiple choice (single answer)',
  mc_multi: 'Multiple choice (multiple answers)',
  true_false: 'True / False',
  short_answer: 'Identification',
};

// ==========================================================================
// PER-KIND CONFIG — alias of quiz config types
// ==========================================================================
// Practice questions store the exact same per-kind config shapes as
// quiz_questions, just restricted to the 4 auto-gradable kinds. We alias
// the types here instead of redeclaring so the validators + graders from
// quizGenerator.ts work without modification.

export type PracticeQuestionConfig =
  | McSingleConfig
  | McMultiConfig
  | TrueFalseConfig
  | ShortAnswerConfig;

// ==========================================================================
// CORE ENTITY TYPES (camelCase, post-mapping)
// ==========================================================================

export interface PracticeSession {
  id: string;
  studentId: string;
  title: string;
  sourceKind: PracticeSourceKind;
  // Set when sourceKind === 'lesson'. May go null if the source lesson
  // was deleted after the session was created (ON DELETE SET NULL).
  sourceLessonId: string | null;
  // Set when sourceKind === 'upload'. Display-only — the file content
  // itself isn't persisted server-side.
  sourceFileNames: string[];
  sourceNote: string | null;
  difficulty: PracticeDifficulty;
  requestedCount: number;
  modelUsed: string | null;
  tokensUsed: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeQuestion {
  id: string;
  sessionId: string;
  questionKind: PracticeQuestionKind;
  prompt: string;
  points: number;
  displayOrder: number;
  config: PracticeQuestionConfig;
  explanation: string | null;
  createdAt: string;
}

// One row per take-through of a session.
export interface PracticeAttempt {
  id: string;
  sessionId: string;
  studentId: string;
  startedAt: string;
  // Null while the attempt is in progress; ISO timestamp once submitted.
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  responses: PracticeAttemptResponse[];
  createdAt: string;
  updatedAt: string;
}

// One entry inside practice_attempts.responses (jsonb array).
// Captured at submit time so the history is stable even if questions
// were ever to change (they shouldn't — questions are read-only).
export interface PracticeAttemptResponse {
  questionId: string;
  answer: QuestionAnswer;
  correct: boolean;
  points: number;
}

// ==========================================================================
// VIEW SHAPES
// ==========================================================================

// What the landing page sees per session row.
export interface PracticeSessionListItem extends PracticeSession {
  questionCount: number;
  attemptCount: number;
  // The student's best score across all completed attempts, or null if
  // no completed attempt yet.
  bestScore: number | null;
  bestMaxScore: number | null;
  lastAttemptedAt: string | null;
}

// What the session detail page sees.
export interface PracticeSessionDetail {
  session: PracticeSession;
  questions: PracticeQuestion[];
  attempts: PracticeAttempt[];
}

// What the "take attempt" view sees — questions WITHOUT the correct
// answers stripped. Practice is self-driven, so we don't sanitize.
// The student sees what they want to see; they own the session.
export interface PracticeAttemptInProgress {
  attempt: PracticeAttempt;
  session: PracticeSession;
  questions: PracticeQuestion[];
}

// ==========================================================================
// CLIENT-SIDE GRADING HELPERS
// ==========================================================================
// Lightweight deterministic grading for the 4 auto-gradable kinds. Runs
// server-side at submit time; mirrors the existing quiz grading semantics
// (case-insensitive trimmed match for short answers, etc.) so the student
// experience is consistent between practice and real quizzes.

export function gradeAnswer(
  kind: PracticeQuestionKind,
  config: PracticeQuestionConfig,
  answer: QuestionAnswer,
): boolean {
  switch (kind) {
    case 'mc_single': {
      const c = config as McSingleConfig;
      const a = answer as { selected: number };
      if (typeof a.selected !== 'number' || a.selected < 0) return false;
      return c.correct[0] === a.selected;
    }
    case 'mc_multi': {
      const c = config as McMultiConfig;
      const a = answer as { selected: number[] };
      if (!Array.isArray(a.selected)) return false;
      if (a.selected.length !== c.correct.length) return false;
      const got = [...a.selected].sort((x, y) => x - y);
      const expected = [...c.correct].sort((x, y) => x - y);
      return got.every((v, i) => v === expected[i]);
    }
    case 'true_false': {
      const c = config as TrueFalseConfig;
      const a = answer as { selected: boolean };
      if (typeof a.selected !== 'boolean') return false;
      return c.correct === a.selected;
    }
    case 'short_answer': {
      const c = config as ShortAnswerConfig;
      const a = answer as { text: string };
      if (typeof a.text !== 'string') return false;
      const submitted = c.case_sensitive ? a.text.trim() : a.text.trim().toLowerCase();
      return c.acceptable.some((acc) => {
        const target = c.case_sensitive ? acc.trim() : acc.trim().toLowerCase();
        return submitted === target;
      });
    }
  }
}