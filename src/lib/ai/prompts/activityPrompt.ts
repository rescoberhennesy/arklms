// src/lib/ai/prompts/activityPrompt.ts
//
// AI generator for an activity's Question / prompt section.
// Output: a list of questions (optionally with points per item) that the
// route renders to Markdown. The teacher reviews and saves it.

export type ActivityQuestionStyle =
  | 'identification'
  | 'true_false'
  | 'multiple_choice'
  | 'essay'
  | 'problem'
  | 'mixed';

export const ACTIVITY_QUESTION_STYLES: ActivityQuestionStyle[] = [
  'identification',
  'true_false',
  'multiple_choice',
  'essay',
  'problem',
  'mixed',
];

export const ACTIVITY_QUESTION_STYLE_LABELS: Record<ActivityQuestionStyle, string> = {
  identification: 'Identification',
  true_false: 'True or False',
  multiple_choice: 'Multiple choice',
  essay: 'Essay / explain',
  problem: 'Problem solving (with computations)',
  mixed: 'Mixed',
};

export interface ActivityPromptInput {
  activityTitle: string;
  instructions: string;
  maxPoints: number;
  submissionTypeLabel: string;
  count: number;
  style: ActivityQuestionStyle;
  focus: string;
  includePoints: boolean;
  sourceFileNames: string[];
}

export interface ActivityPromptDraft {
  errorMessage?: string;
  questions?: { text: string; points?: number }[];
}

export const ACTIVITY_PROMPT_SYSTEM_INSTRUCTION = `
You write activity questions for Philippine senior high school students
(Grades 11–12). A teacher will review and edit your questions before students
see them.

RULES:
- Write exactly the requested number of questions unless the source material
  truly cannot support that many (then write fewer; never pad).
- If source files are attached, base EVERY question only on them. Do not add
  outside facts. Without files, base questions on the activity title,
  instructions and the teacher's focus note, using standard SHS-level content.
- Match the requested style:
  - identification: a description, definition or clue; the student writes
    the exact term, name or concept being described. Phrase it as a
    statement or "What is…/Who is…" question with ONE correct term.
  - true_false: a single clear statement that is either true or false.
    Mix true and false statements (roughly half each). Avoid "always/never"
    traps and double negatives.
  - multiple_choice: a question or incomplete statement, then exactly four
    choices on separate lines labeled "a.", "b.", "c.", "d." Only one choice
    is correct; distractors must be plausible. Do not mark the answer.
  - essay: explain, compare, justify or apply; needs a paragraph answer.
  - problem: realistic computation problems with all needed given values
    (use Philippine peso amounts where money is involved); ask students to
    show their solution.
  - mixed: a balanced mix of the styles above. Start each question with its
    type in bold brackets, e.g. "**[Identification]**", "**[True or False]**",
    "**[Multiple choice]**", "**[Essay]**", "**[Problem solving]**".
- Questions must be clear, self-contained and answerable. No trick questions.
- Write ONLY the questions. Never include answers, hints, or an answer key.
- Light markdown is allowed inside a question (bold, line breaks for given
  values or choices). No headings, no numbering of the questions themselves
  (numbering is added for you).
- Match the language of the source/instructions (English or Filipino).
- If points are requested, give each question a whole-number "points" value
  and make them add up EXACTLY to the activity's max points, weighting harder
  questions higher.

TEACHER'S REQUEST: if the teacher adds a request (topic, difficulty, scenario,
language, format of specific items), follow it as long as it does not break
the rules above. Never include answers or an answer key, even if asked.

ESCAPE HATCH: if the source is unreadable, empty, or unrelated to school
work, set errorMessage to one sentence and return no questions.

Reply ONLY with JSON matching the schema.
`.trim();

export const ACTIVITY_PROMPT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    errorMessage: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          points: { type: 'integer' },
        },
        required: ['text'],
      },
    },
  },
} as const;

export function buildActivityPromptUserPrompt(input: ActivityPromptInput): string {
  const lines = [
    'Write activity questions per the system instructions.',
    '',
    `ACTIVITY TITLE: ${input.activityTitle}`,
    `NUMBER OF QUESTIONS: ${input.count}`,
    `QUESTION STYLE: ${input.style}`,
    `SUBMISSION TYPE: ${input.submissionTypeLabel}`,
    `MAX POINTS: ${input.maxPoints}`,
    `POINTS PER QUESTION: ${input.includePoints ? 'yes, must sum to max points' : 'no'}`,
  ];
  if (input.focus.trim()) {
    lines.push(`TEACHER'S REQUEST (follow it): ${input.focus.trim()}`);
  }
  if (input.instructions.trim()) {
    lines.push('', 'ACTIVITY INSTRUCTIONS (context):', input.instructions.trim());
  }
  if (input.sourceFileNames.length > 0) {
    lines.push(
      '',
      `ATTACHED SOURCE FILES: ${input.sourceFileNames.join(', ')}`,
      'Base every question only on the attached files.',
    );
  }
  return lines.join('\n');
}

export function validateActivityPromptDraft(raw: unknown, maxCount: number): ActivityPromptDraft {
  if (!raw || typeof raw !== 'object') throw new Error('AI returned non-object output');
  const obj = raw as Record<string, unknown>;

  if (typeof obj.errorMessage === 'string' && obj.errorMessage.trim()) {
    return { errorMessage: obj.errorMessage.trim() };
  }
  if (!Array.isArray(obj.questions)) throw new Error('AI output missing questions');

  const questions: { text: string; points?: number }[] = [];
  for (const q of obj.questions) {
    if (!q || typeof q !== 'object') continue;
    const item = q as Record<string, unknown>;
    if (typeof item.text !== 'string') continue;
    const text = item.text.trim().replace(/^\d+[.)]\s+/, ''); // strip stray numbering
    if (!text || text.length > 2000) continue;
    const points =
      typeof item.points === 'number' && Number.isFinite(item.points) && item.points > 0
        ? Math.round(item.points)
        : undefined;
    questions.push({ text, points });
    if (questions.length >= maxCount) break;
  }

  if (questions.length === 0) throw new Error('AI returned no valid questions');
  return { questions };
}

/** Numbered Markdown list. Points shown only if they add up to maxPoints.
 *  Extra lines (choices, given values) stay inside the item as line breaks. */
export function renderActivityPromptMarkdown(
  questions: { text: string; points?: number }[],
  maxPoints: number,
  includePoints: boolean,
): string {
  const sum = questions.reduce((acc, q) => acc + (q.points ?? 0), 0);
  const showPoints =
    includePoints && questions.every((q) => q.points) && Math.abs(sum - maxPoints) < 0.001;

  return questions
    .map((q, i) => {
      const prefix = showPoints ? `**(${q.points} pts)** ` : '';
      const lines = q.text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      // "  \n" = hard line break; 3-space indent keeps it in the list item
      const body = lines.join('  \n   ');
      return `${i + 1}. ${prefix}${body}`;
    })
    .join('\n\n');
}