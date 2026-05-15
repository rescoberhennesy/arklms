
// src/lib/ai/readability.ts
//
// Pure-JS readability + language-detection helpers for the lesson analyzer.
//
// Why this file is code, not AI:
//   The AI is allowed to interpret these numbers. It is NOT allowed to compute
//   them. Flesch-Kincaid reading ease is a deterministic formula; running it
//   in code (vs. asking the AI) is faster, cheaper, and impossible for the
//   model to fabricate. This separation survives a defense question of
//   "how do you know the AI didn't lie about the reading level?"
//
// Scope:
//   - stripMarkdown(): turn lesson markdown into plain prose for analysis
//   - countSentences/Words/Syllables: standard textstat-style approximations
//   - fleschReadingEase: classic Flesch formula
//   - detectLikelyFilipino: heuristic for Filipino/Taglish content where the
//     English-only Flesch score wouldn't make sense

// ---------------------------------------------------------------------------
// Markdown stripper (reused conceptually from quiz export, but inlined here
// to keep this file dependency-free)
// ---------------------------------------------------------------------------

export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')   // fenced code blocks → drop entirely
    .replace(/`[^`]+`/g, ' ')          // inline code → drop
    .replace(/!\[.*?\]\(.*?\)/g, ' ')  // images → drop
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')// links → keep label
    .replace(/^#{1,6}\s*/gm, '')       // heading marks
    .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
    .replace(/\*(.+?)\*/g, '$1')       // italic *
    .replace(/_(.+?)_/g, '$1')         // italic _
    .replace(/~~(.+?)~~/g, '$1')       // strikethrough
    .replace(/^[-*+>]\s+/gm, '')       // bullet / blockquote marks
    .replace(/^\d+\.\s+/gm, '')        // ordered list marks
    .replace(/\s+/g, ' ')              // collapse whitespace
    .trim();
}

// ---------------------------------------------------------------------------
// Sentence / word / syllable counters
// ---------------------------------------------------------------------------

export function countSentences(text: string): number {
  // Split on . ! ? followed by space or end of string. Filter empties.
  const parts = text
    .split(/[.!?]+(?:\s|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return Math.max(1, parts.length);
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

// Approximate syllable counter for English. Standard regex approach used by
// most textstat libraries — counts vowel groups, with corrections for silent
// trailing 'e' and minimum syllable floor of 1.
export function countSyllablesInWord(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;

  // Drop silent trailing 'e'
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  // Count vowel groups
  const groups = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function countSyllables(text: string): number {
  return text
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .reduce((sum, w) => sum + countSyllablesInWord(w), 0);
}

// ---------------------------------------------------------------------------
// Flesch reading ease
//   206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
//   Higher = easier. ~70+ is "easy to read"; ~30 is "very difficult".
// ---------------------------------------------------------------------------

export interface ReadabilityStats {
  words: number;
  sentences: number;
  syllables: number;
  avgWordsPerSentence: number;
  avgSyllablesPerWord: number;
  fleschReadingEase: number;        // can go negative for very dense text
  readingLevelLabel: string;        // human-readable interpretation
}

export function fleschReadingEase(plain: string): ReadabilityStats {
  const words = countWords(plain);
  const sentences = countSentences(plain);
  const syllables = countSyllables(plain);

  // Guard against tiny / empty input
  if (words === 0 || sentences === 0) {
    return {
      words,
      sentences,
      syllables,
      avgWordsPerSentence: 0,
      avgSyllablesPerWord: 0,
      fleschReadingEase: 0,
      readingLevelLabel: 'Not enough text to score',
    };
  }

  const avgWordsPerSentence = words / sentences;
  const avgSyllablesPerWord = syllables / words;
  const fre =
    206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

  return {
    words,
    sentences,
    syllables,
    avgWordsPerSentence: Number(avgWordsPerSentence.toFixed(2)),
    avgSyllablesPerWord: Number(avgSyllablesPerWord.toFixed(2)),
    fleschReadingEase: Number(fre.toFixed(1)),
    readingLevelLabel: labelForFlesch(fre),
  };
}

function labelForFlesch(fre: number): string {
  // Labels scoped for senior high school (Grades 11–12) audience.
  // Target band for this audience: ~50–70 (Grade 10–12 reading).
  if (fre >= 90) return 'Very easy (well below SHS level)';
  if (fre >= 80) return 'Easy (below SHS level — may be too simple)';
  if (fre >= 70) return 'Comfortable for SHS readers (Grade 7–8 level)';
  if (fre >= 60) return 'Appropriate for SHS (Grade 8–10 level)';
  if (fre >= 50) return 'Appropriate for SHS (Grade 10–12 level)';
  if (fre >= 30) return 'Challenging for SHS — consider simplifying';
  return 'Too dense for SHS readers — simplify sentences and vocabulary';
}
// ---------------------------------------------------------------------------
// Filipino / Tagalog detection (heuristic)
//   We don't run Flesch on Filipino text because the formula's syllable
//   weights are calibrated for English. Instead we flag the text so the AI
//   knows to skip the reading-level criterion and use only the qualitative
//   ones.
//
//   Detection is intentionally simple: presence of common function words.
//   Better than nothing, defensible at defense ("we acknowledge the limit
//   and degrade gracefully"). False positives are cheap (skipping a metric
//   that wouldn't apply); false negatives mean we apply English Flesch to
//   Filipino text, which is wrong but only affects one of three criteria.
// ---------------------------------------------------------------------------

const FILIPINO_MARKERS = [
  'ang', 'ng', 'mga', 'sa', 'ay', 'ko', 'mo', 'siya', 'sila', 'kami',
  'natin', 'ito', 'iyan', 'iyon', 'hindi', 'oo', 'kasi', 'dahil',
  'kapag', 'pero', 'tapos', 'lang', 'naman', 'pala', 'nga', 'po',
  'opo', 'salamat', 'kumusta', 'mahal', 'paano', 'bakit', 'saan',
  'kanino', 'alin', 'ilan', 'maraming', 'gusto', 'ayaw', 'pwede',
];

export function detectLikelyFilipino(text: string): boolean {
  const tokens = text
    .toLowerCase()
    .split(/[^a-zñ]+/)
    .filter((t) => t.length > 0);

  if (tokens.length < 20) return false; // not enough signal

  const hits = tokens.filter((t) => FILIPINO_MARKERS.includes(t)).length;
  // Threshold: 5% of tokens being Filipino function words is a strong signal
  return hits / tokens.length >= 0.05;
}

// ---------------------------------------------------------------------------
// One-shot analyzer
// ---------------------------------------------------------------------------

export interface LessonMetrics {
  rawCharCount: number;
  plainCharCount: number;
  stats: ReadabilityStats;
  likelyFilipino: boolean;
}

export function computeLessonMetrics(markdown: string): LessonMetrics {
  const plain = stripMarkdown(markdown);
  return {
    rawCharCount: markdown.length,
    plainCharCount: plain.length,
    stats: fleschReadingEase(plain),
    likelyFilipino: detectLikelyFilipino(plain),
  };
}
