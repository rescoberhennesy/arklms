// src/lib/ai/prompts/flashcardGenerator.ts
//
// Prompt + Gemini response schema + validator for AI flashcard generation.
//
// Design:
//   - Input: lesson title + lesson body (markdown). No file upload.
//   - Output: 5–15 front/back card pairs grounded ONLY in the lesson content.
//   - Card pairs should test recall of key terms, definitions, formulas, or
//     concrete facts FROM the lesson. Not opinion. Not synthesis.
//   - Escape hatch: errorMessage if lesson is too short or off-topic.
//
// Persistence pattern (matches AIReviewerModal / quiz generator):
//   - ai_generations row created in route (status=draft, raw_output=draft)
//   - ai_usage_log row on success/error/rate_limited
//   - Teacher reviews, edits, then publishes → status='published'

import type { ModuleTerm } from '@/lib/types/modules';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlashcardPair {
  front: string;
  back: string;
}

export interface FlashcardGeneratorDraft {
  errorMessage?: string;
  cards?: FlashcardPair[];
  sourceNote?: string;     // brief explanation of what topic the cards cover
}

export interface FlashcardGeneratorInput {
  lessonTitle: string;
  lessonBody: string;
  // Number of cards the teacher requested; AI may return fewer if the lesson
  // doesn't support that many distinct facts.
  desiredCount: number;
}

// ---------------------------------------------------------------------------
// System instruction
// ---------------------------------------------------------------------------

export const FLASHCARD_GENERATOR_SYSTEM_INSTRUCTION = `
You are an instructional designer creating study flashcards for Philippine
senior high school students (Grades 11–12).

INPUT: a lesson title and its body content (markdown). You will produce
a JSON list of front/back card pairs.

CARD RULES:
- Front: a question, term, concept, or prompt. Short (max ~120 characters).
  Examples: "What are the four functions of management?",
  "Define: organizing", "Formula for simple interest?"
- Back: the concise answer. Short (max ~250 characters). Direct, factual,
  matches what's in the lesson body. No filler ("The answer is...", "Well,").
- Both sides may use light markdown — bold for key terms, code ticks for
  formulas, line breaks. No headings, no images, no tables.

CONTENT RULES:
- Cards must be GROUNDED in the lesson body. Do not invent facts the lesson
  doesn't contain. Do not add outside knowledge.
- Cover the most important concepts first. If the lesson defines terms,
  make definition cards. If it lists steps or functions, make recall cards
  ("What is step 3?"). If it has formulas, make formula cards.
- Vary the card types — a deck of 10 cards should not be 10 definitions.
  Mix definitions, recall, "name the X", "what does Y do".
- Do not duplicate cards (same front, different wording — that's still a
  duplicate).
- Avoid trivia. A flashcard testing "what year was this lesson written"
  has no educational value.

LANGUAGE:
- Match the lesson's primary language. If the lesson is in English, write
  cards in English. If Filipino/Taglish, write in Filipino/Taglish.
- Never mix languages within a single card.

ESCAPE HATCH:
If the lesson is too short to support flashcards (under ~50 plain words), or
if it's not a lesson at all (placeholder, table of contents, random text),
set errorMessage to a one-sentence explanation and omit cards entirely.

QUANTITY:
The teacher will specify a desired card count. Try to produce that many,
but it's OK to return fewer if the lesson genuinely doesn't contain enough
distinct, card-worthy facts. NEVER pad with weak cards just to hit the count.

Reply ONLY with JSON matching the provided schema.
`.trim();

// ---------------------------------------------------------------------------
// Response schema (Gemini structured output)
// ---------------------------------------------------------------------------

export const FLASHCARD_GENERATOR_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    errorMessage: { type: 'string' },
    sourceNote: { type: 'string' },
    cards: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: {
        type: 'object',
        properties: {
          front: { type: 'string', minLength: 1 },
          back:  { type: 'string', minLength: 1 },
        },
        required: ['front', 'back'],
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

export function buildFlashcardGeneratorUserPrompt(
  input: FlashcardGeneratorInput,
): string {
  const { lessonTitle, lessonBody, desiredCount } = input;
  return `
Generate flashcards from this lesson per the system instructions.

LESSON TITLE: ${lessonTitle}
DESIRED CARD COUNT: ${desiredCount}

LESSON BODY (markdown):
---
${lessonBody}
---

Reply ONLY with JSON matching the schema. The cards array should contain
${desiredCount} cards if the lesson supports it; fewer is acceptable.
`.trim();
}

// ---------------------------------------------------------------------------
// Runtime validator + cleanup
// ---------------------------------------------------------------------------

export function validateFlashcardDraft(
  raw: unknown,
): FlashcardGeneratorDraft {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI returned non-object output');
  }
  const obj = raw as Record<string, unknown>;

  // Escape hatch
  if (typeof obj.errorMessage === 'string' && obj.errorMessage.trim()) {
    return { errorMessage: obj.errorMessage.trim() };
  }

  if (!Array.isArray(obj.cards)) {
    throw new Error('AI output missing cards array');
  }

  const cleanCards: FlashcardPair[] = [];
  for (const c of obj.cards) {
    if (!c || typeof c !== 'object') continue;
    const card = c as Record<string, unknown>;
    if (typeof card.front !== 'string' || typeof card.back !== 'string') continue;
    const front = card.front.trim();
    const back = card.back.trim();
    if (!front || !back) continue;
    // Length guards — keep the deck readable
    if (front.length > 500 || back.length > 1000) continue;
    cleanCards.push({ front, back });
  }

  if (cleanCards.length === 0) {
    throw new Error('AI returned no valid cards');
  }

  // De-duplicate by exact-match front (case-insensitive)
  const seen = new Set<string>();
  const deduped = cleanCards.filter((c) => {
    const key = c.front.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    cards: deduped,
    sourceNote:
      typeof obj.sourceNote === 'string' && obj.sourceNote.trim()
        ? obj.sourceNote.trim()
        : undefined,
  };
}

// Re-export type to satisfy moduleTerm import elsewhere if needed
export type { ModuleTerm };