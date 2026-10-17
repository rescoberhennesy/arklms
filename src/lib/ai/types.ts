// src/lib/ai/types.ts
// Shared TypeScript types for the AI subsystem.
export type AIFeature =
  | "quiz"
  | "reviewer"
  | "activity_suggest"
  | "rubric"
  | "analytics_insight"
  | "feedback"
  | "announcement"
  | "lesson_analysis"
  | "flashcards"
  | 'activity_prompt'
  | "ping"
  | "practice";  // ← note the leading |
export type GenerationStatus = "draft" | "edited" | "published" | "discarded";
export type UsageStatus = "success" | "rate_limited" | "error";
export type AIModel = "fast" | "pro";
export type TokenUsage = {
  input: number;
  output: number;
};