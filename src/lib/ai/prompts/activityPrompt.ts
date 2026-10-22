// src/lib/ai/prompts/activityPrompt.ts
//
// AI generator for an activity's Question / prompt section.
// Output: a list of questions (optionally with points per item) that the
// route renders to Markdown. The teacher reviews and saves it.

export type ActivityQuestionStyle =
  | 'mc_single'
  | 'mc_multi'
  | 'true_false'
  | 'true_false_modified'
  | 'identification'
  | 'essay'
  | 'matching';

export const ACTIVITY_QUESTION_STYLES: ActivityQuestionStyle[] = [
  'mc_single',
  'mc_multi',
  'true_false',
  'true_false_modified',
  'identification',
  'essay',
  'matching',
];

export const ACTIVITY_QUESTION_STYLE_LABELS: Record<ActivityQuestionStyle, string> = {
  mc_single: 'Multiple choice (single answer)',
  mc_multi: 'Multiple choice (multiple answers)',
  true_false: 'True or False',
  true_false_modified: 'True or False (modified)',
  identification: 'Identification',
  essay: 'Essay',
  matching: 'Matching type',
};

/** Standard directions shown above the generated set. */
export const ACTIVITY_STYLE_DIRECTIONS: Record<ActivityQuestionStyle, string> = {
  mc_single: 'Choose the letter of the correct answer.',
  mc_multi:
    'Choose all the letters of the correct answers. Each item may have more than one correct answer.',
  true_false: 'Write TRUE if the statement is correct and FALSE if it is not.',
  true_false_modified:
    'Write TRUE if the statement is correct. If it is false, change the word or phrase in bold to make the statement correct.',
  identification: 'Identify the term or concept being described.',
  essay: 'Answer each question in complete sentences.',
  matching:
    'Match each item in Column A with the correct item in Column B. Write the letter of your answer.',
};

export function isActivityQuestionStyle(v: string): v is ActivityQuestionStyle {
  return (ACTIVITY_QUESTION_STYLES as string[]).includes(v);
}

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
  EXCEPTION: for matching, write exactly ONE question that contains the
  requested number of pairs.
- If source files are attached, base EVERY question only on them. Do not add
  outside facts. Without files, base questions on the activity title,
  instructions and the teacher's focus note, using standard SHS-level content.
- Match the requested style:
  - mc_single: a question or incomplete statement, then exactly four choices,
    each on its own line, labeled "a.", "b.", "c.", "d.". Exactly ONE choice is
    correct; distractors must be plausible and drawn from related concepts.
  - mc_multi: a question, then 4 to 6 choices on their own lines labeled "a.",
    "b.", "c.", … At least two and at most (choices − 1) are correct. End the
    question line with "(Choose all that apply.)".
  - true_false: a single clear statement that is either true or false.
    Mix true and false (roughly half each). Avoid "always/never" traps and
    double negatives.
  - true_false_modified: a single statement with exactly ONE key word or short
    phrase in bold (**like this**). The statement is either true, or false
    because of the bold part only (changing it would make it true). Mix true
    and false (roughly half each). Never bold more than one part.
  - identification: a description, definition or clue; the student writes the
    exact term, name or concept. Phrase it as a statement or "What is…/Who
    is…". Exactly ONE correct term.
  - essay: explain, compare, justify, analyze or apply; needs a paragraph
    answer. Be specific about what a complete answer covers.
  - matching: ONE question. First line: "Column A". Then one line per item
    written as "(1) item", "(2) item", … Then a line "Column B". Then one line
    per match written as "(a) match", "(b) match", … Column B must be
    SHUFFLED so (1) does not match (a), and so on. Every item has exactly one
    match. Keep Column B entries short (under ~15 words) and similar in style.
- Questions must be clear, self-contained and answerable. No trick questions.
- Write ONLY the questions. Never include answers, hints, or an answer key.
- Do not write a "Directions:" line; directions are added for you.
- Light markdown is allowed inside a question (bold, line breaks for choices
  or given values). No headings, no numbering of the questions themselves
  (numbering is added for you).
- Match the language of the source/instructions (English or Filipino).
- If points are requested, give each question a whole-number "points" value
  and make them add up EXACTLY to the activity's max points, weighting harder
  questions higher. For matching, the single question gets all the points.

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
  const isMatching = input.style === 'matching';
  const lines = [
    'Write activity questions per the system instructions.',
    '',
    `ACTIVITY TITLE: ${input.activityTitle}`,
    isMatching
      ? `NUMBER OF PAIRS: ${input.count} (write ONE matching question with ${input.count} pairs)`
      : `NUMBER OF QUESTIONS: ${input.count}`,
    `QUESTION STYLE: ${input.style} (${ACTIVITY_QUESTION_STYLE_LABELS[input.style]})`,
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
    const text = item.text
      .trim()
      .replace(/^\d+[.)]\s+/, '') // strip stray numbering
      .replace(/^\*?directions:?\*?.*\n/i, ''); // strip a stray directions line
    if (!text || text.length > 3000) continue;
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
 *  Extra lines (choices, given values) stay inside the item as line breaks.
 *  Pass `style` to add the standard "Directions:" line on top. */
export function renderActivityPromptMarkdown(
  questions: { text: string; points?: number }[],
  maxPoints: number,
  includePoints: boolean,
  style?: ActivityQuestionStyle,
): string {
  const sum = questions.reduce((acc, q) => acc + (q.points ?? 0), 0);
  const showPoints =
    includePoints && questions.every((q) => q.points) && Math.abs(sum - maxPoints) < 0.001;

  const directions = style ? `**Directions:** ${ACTIVITY_STYLE_DIRECTIONS[style]}\n\n` : '';

  // Matching is one set: render it as a block, not a numbered item.
  if (style === 'matching') {
    const body = questions
      .map((q) => {
        const prefix = showPoints ? `**(${q.points} pts)**  \n` : '';
        const lines = q.text
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => (/^column [ab]$/i.test(l) ? `**${l}**` : l));
        return prefix + lines.join('  \n');
      })
      .join('\n\n');
    return directions + body;
  }

  const list = questions
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

  return directions + list;
}