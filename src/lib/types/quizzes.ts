// src/lib/types/quizzes.ts
//
// Pure types + constants for quizzes. No async functions, no server-only code.
// Imported by both server actions and client components.
//
// DB column → camelCase mapping happens in src/lib/actions/quizzes.ts; the
// types here describe the camelCase shape the rest of the app sees.

// ==========================================================================
// QUESTION KINDS
// ==========================================================================

export const QUESTION_KINDS = [
  'mc_single',
  'mc_multi',
  'true_false',
  'short_answer',
  'essay',
  'matching',
] as const;

export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const QUESTION_KIND_LABELS: Record<QuestionKind, string> = {
  mc_single: 'Multiple choice (single answer)',
  mc_multi: 'Multiple choice (multiple answers)',
  true_false: 'True / False',
  short_answer: 'Short answer',
  essay: 'Essay',
  matching: 'Matching',
};

// Auto-graded vs manual-only. Used by UI to know whether to show
// "release grade" affordances after submit.
export const AUTO_GRADED_KINDS: ReadonlySet<QuestionKind> = new Set([
  'mc_single',
  'mc_multi',
  'true_false',
  'short_answer',
  'matching',
]);

export const MANUAL_ONLY_KINDS: ReadonlySet<QuestionKind> = new Set(['essay']);

// ==========================================================================
// PER-KIND CONFIG SHAPES
// ==========================================================================
// These describe the `config` jsonb column on quiz_questions for each kind.
// Mirror these exactly when writing answers to keep the auto-grading RPC happy.

export interface McSingleConfig {
  options: string[];
  correct: [number]; // exactly one index
}

export interface McMultiConfig {
  options: string[];
  correct: number[]; // 1+ indices
}

export interface TrueFalseConfig {
  correct: boolean;
}

export interface ShortAnswerConfig {
  acceptable: string[];
  case_sensitive: boolean;
}

export type EssayConfig = Record<string, never>; // {}

export interface MatchingConfig {
  left: string[];
  right: string[];
  pairs: Array<[number, number]>; // [left_index, right_index]
}

export type QuestionConfig =
  | McSingleConfig
  | McMultiConfig
  | TrueFalseConfig
  | ShortAnswerConfig
  | EssayConfig
  | MatchingConfig;

// ==========================================================================
// PER-KIND ANSWER SHAPES
// ==========================================================================
// Stored in quiz_responses.answer (jsonb). Mirrors what submit_quiz_attempt
// expects; do NOT change shapes without also updating the RPC.

export interface McSingleAnswer {
  selected: number; // index
}

export interface McMultiAnswer {
  selected: number[]; // indices
}

export interface TrueFalseAnswer {
  selected: boolean;
}

export interface ShortAnswerAnswer {
  text: string;
}

export interface EssayAnswer {
  text: string;
}

export interface MatchingAnswer {
  pairs: Array<[number, number]>;
}

export type QuestionAnswer =
  | McSingleAnswer
  | McMultiAnswer
  | TrueFalseAnswer
  | ShortAnswerAnswer
  | EssayAnswer
  | MatchingAnswer;

// Empty/initial answer for each kind. Used by client editor to seed
// quiz_responses rows when a student first navigates to a question.
export function defaultAnswerFor(kind: QuestionKind): QuestionAnswer {
  switch (kind) {
    case 'mc_single':
      return { selected: -1 } as McSingleAnswer;
    case 'mc_multi':
      return { selected: [] } as McMultiAnswer;
    case 'true_false':
      // Use a sentinel; UI maps -1 → unanswered, but boolean has no neutral.
      // Caller should treat absence of the response row as "unanswered" instead.
      return { selected: false } as TrueFalseAnswer;
    case 'short_answer':
      return { text: '' } as ShortAnswerAnswer;
    case 'essay':
      return { text: '' } as EssayAnswer;
    case 'matching':
      return { pairs: [] } as MatchingAnswer;
  }
}

// Default config for a freshly-created question of each kind. Used by
// QuestionEditor's "add question" path.
export function defaultConfigFor(kind: QuestionKind): QuestionConfig {
  switch (kind) {
    case 'mc_single':
      return { options: ['', ''], correct: [0] } as McSingleConfig;
    case 'mc_multi':
      return { options: ['', ''], correct: [] } as McMultiConfig;
    case 'true_false':
      return { correct: true } as TrueFalseConfig;
    case 'short_answer':
      return { acceptable: [''], case_sensitive: false } as ShortAnswerConfig;
    case 'essay':
      return {} as EssayConfig;
    case 'matching':
      return { left: ['', ''], right: ['', ''], pairs: [[0, 0]] } as MatchingConfig;
  }
}

// ==========================================================================
// CORE ENTITY TYPES
// ==========================================================================

export interface QuizQuestion {
  id: string;
  activityId: string;
  questionKind: QuestionKind;
  prompt: string;
  points: number;
  displayOrder: number;
  shuffleOptions: boolean;
  config: QuestionConfig;
  createdAt: string;
  updatedAt: string;
}

export interface QuizAttempt {
  id: string;
  activityId: string;
  studentId: string;
  startedAt: string;
  submittedAt: string | null;
  autoScore: number | null;
  manualScoreOverride: number | null;
  submissionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuizResponse {
  id: string;
  attemptId: string;
  questionId: string;
  answer: QuestionAnswer;
  autoCorrect: boolean | null;
  autoPoints: number | null;
  manualPoints: number | null;
  feedback: string | null;
  createdAt: string;
  updatedAt: string;
}

// Activity-level quiz config (from `activities` table).
// Lives separately from QuizQuestion / QuizAttempt because it's stored on
// the activity row itself, not its own table.
export interface QuizConfig {
  timeLimitMinutes: number | null;
  shuffleQuestions: boolean;
  autoReleaseGrade: boolean;
  showCorrectAnswers: boolean;
  quizTotalPoints: number | null;
}

// ==========================================================================
// VIEW SHAPES (composed for UI)
// ==========================================================================

// What the teacher's quiz editor sees: questions + activity-level config.
export interface TeacherQuizView {
  activityId: string;
  config: QuizConfig;
  questions: QuizQuestion[];
  // Lock flag: true once any student attempt exists (per Session 9
  // design decision: lock on first attempt, no per-attempt snapshots).
  questionsLocked: boolean;
  attemptCount: number;
}

// What the student sees when starting/resuming an attempt. Questions are
// returned without the `correct` fields for non-MC kinds; for MC kinds
// the correct array is stripped out at the action layer.
export type StudentQuestionView = Omit<QuizQuestion, 'config'> & {
  // Sanitized config — correct keys removed for kinds where revealing
  // them would defeat the assessment.
  config: SanitizedQuestionConfig;
};

export type SanitizedMcConfig = { options: string[] };
export type SanitizedTrueFalseConfig = Record<string, never>;
export type SanitizedShortAnswerConfig = Record<string, never>;
export type SanitizedEssayConfig = Record<string, never>;
export type SanitizedMatchingConfig = { left: string[]; right: string[] };

export type SanitizedQuestionConfig =
  | SanitizedMcConfig
  | SanitizedTrueFalseConfig
  | SanitizedShortAnswerConfig
  | SanitizedEssayConfig
  | SanitizedMatchingConfig;

export interface StudentAttemptView {
  attempt: QuizAttempt;
  config: QuizConfig;
  questions: StudentQuestionView[];
  responses: QuizResponse[];
  // Computed: deadline_at = started_at + time_limit_minutes if time-limited,
  // null otherwise. Used by client timer.
  deadlineAt: string | null;
}

// What the teacher sees when grading a single attempt (manual-grade UI).
// Includes full (unsanitized) questions + responses + student profile +
// the activity-level fields the grader UI needs:
//   - quizTotalPoints: for the score display denominator
//   - autoReleaseGrade: drives the "already released" warning copy
//   - currentScore: the score that would be shown to the student right now
//                   (manual_score_override if set, else auto_score, else 0)
//   - activityTitle, activityDueAt: for the page header
//   - gradeReleasedAt: the released_at from activity_grades, or null
export interface AttemptForGradingView {
  attempt: QuizAttempt;
  activityId: string;
  classId: string;
  activityTitle: string;
  activityDueAt: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string | null;
  questions: QuizQuestion[];
  responses: QuizResponse[];
  quizTotalPoints: number;
  autoReleaseGrade: boolean;
  currentScore: number;
  gradeReleasedAt: string | null;
}

// Row shape returned by listQuizAttemptsForQuiz, augmented with the
// derived fields the attempts panel needs for at-a-glance triage.
//
//   - needsManualReview: true iff there exists at least one essay /
//     short_answer response with manual_points IS NULL AND the attempt
//     is submitted. (Pre-submit attempts are "in progress", not "needs
//     review".)
//   - hasGrade: an activity_grades row exists for this attempt's submission
//   - gradeReleasedAt: when the grade was released to the student, null
//     if not yet released
//   - displayScore: the score visible to the student right now (manual
//     override if set, else auto, else null when no attempt-derived
//     grade exists yet)
export interface QuizAttemptListItem extends QuizAttempt {
  studentName: string | null;
  studentEmail: string | null;
  needsManualReview: boolean;
  hasGrade: boolean;
  gradeReleasedAt: string | null;
  displayScore: number | null;
}

// Status enum for the quiz-attempt-flow state machine.
// Used by the gradebook integration + StudentActivities surfacing.
export type QuizAttemptStatus =
  | 'not_started' // no row in quiz_attempts
  | 'in_progress' // started_at set, submitted_at null
  | 'submitted' // submitted_at set, no manual essays pending
  | 'awaiting_manual' // submitted but has essay/short_answer with manual_points = null
  | 'graded_unreleased' // grade exists but returned_at null
  | 'graded_released'; // grade exists, returned_at set

// ==========================================================================
// VALIDATION HELPERS
// ==========================================================================
// These don't enforce — DB CHECKs are the source of truth — but give
// fast client-side feedback.

export function validateQuestionConfig(
  kind: QuestionKind,
  config: QuestionConfig,
): string | null {
  switch (kind) {
    case 'mc_single': {
      const c = config as McSingleConfig;
      if (!Array.isArray(c.options) || c.options.length < 2) {
        return 'Multiple choice needs at least 2 options.';
      }
      if (c.options.some((o) => o.trim() === '')) {
        return 'All options must have text.';
      }
      if (
        !Array.isArray(c.correct) ||
        c.correct.length !== 1 ||
        c.correct[0] < 0 ||
        c.correct[0] >= c.options.length
      ) {
        return 'Pick exactly one correct option.';
      }
      return null;
    }
    case 'mc_multi': {
      const c = config as McMultiConfig;
      if (!Array.isArray(c.options) || c.options.length < 2) {
        return 'Multiple choice needs at least 2 options.';
      }
      if (c.options.some((o) => o.trim() === '')) {
        return 'All options must have text.';
      }
      if (!Array.isArray(c.correct) || c.correct.length === 0) {
        return 'Pick at least one correct option.';
      }
      if (c.correct.some((i) => i < 0 || i >= c.options.length)) {
        return 'Correct option indices are out of range.';
      }
      return null;
    }
    case 'true_false': {
      const c = config as TrueFalseConfig;
      if (typeof c.correct !== 'boolean') {
        return 'Pick True or False.';
      }
      return null;
    }
    case 'short_answer': {
      const c = config as ShortAnswerConfig;
      if (!Array.isArray(c.acceptable) || c.acceptable.length === 0) {
        return 'Add at least one acceptable answer.';
      }
      if (c.acceptable.some((a) => a.trim() === '')) {
        return 'Acceptable answers must have text.';
      }
      return null;
    }
    case 'essay':
      return null;
    case 'matching': {
      const c = config as MatchingConfig;
      if (!Array.isArray(c.left) || c.left.length < 2) {
        return 'Add at least 2 items on the left.';
      }
      if (!Array.isArray(c.right) || c.right.length < 2) {
        return 'Add at least 2 items on the right.';
      }
      if (c.left.some((s) => s.trim() === '')) {
        return 'All left items must have text.';
      }
      if (c.right.some((s) => s.trim() === '')) {
        return 'All right items must have text.';
      }
      if (!Array.isArray(c.pairs) || c.pairs.length === 0) {
        return 'Add at least one correct pair.';
      }
      if (
        c.pairs.some(
          ([l, r]) =>
            l < 0 || l >= c.left.length || r < 0 || r >= c.right.length,
        )
      ) {
        return 'Pair indices are out of range.';
      }
      return null;
    }
  }
}