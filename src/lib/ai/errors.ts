// src/lib/ai/errors.ts
// Typed AI error classes with user-safe messages.

export class AIError extends Error {
  readonly userMessage: string;
  readonly statusCode: number;

  constructor(opts: { message: string; userMessage: string; statusCode: number }) {
    super(opts.message);
    this.name = "AIError";
    this.userMessage = opts.userMessage;
    this.statusCode = opts.statusCode;
  }
}

export const AIErrors = {
  unauthorized: () =>
    new AIError({
      message: "Unauthenticated request to AI endpoint",
      userMessage: "Please sign in to use this feature.",
      statusCode: 401,
    }),
  forbidden: () =>
    new AIError({
      message: "User does not have permission for AI features",
      userMessage: "Only teachers can use AI features.",
      statusCode: 403,
    }),
  rateLimited: (limit: number) =>
    new AIError({
      message: `Rate limit exceeded: ${limit}/hr`,
      userMessage: `You've reached the hourly AI usage limit (${limit}). Please try again later.`,
      statusCode: 429,
    }),
  geminiFailed: (detail: string) =>
    new AIError({
      message: `Gemini call failed: ${detail}`,
      userMessage: "The AI service is temporarily unavailable. Please try again.",
      statusCode: 502,
    }),
  badInput: (detail: string) =>
    new AIError({
      message: `Bad input: ${detail}`,
      userMessage: "Your request was invalid. Please check the inputs and try again.",
      statusCode: 400,
    }),
};
