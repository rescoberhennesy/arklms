// src/app/api/ai/flashcards/generate/route.ts
//
// POST: generate a flashcard deck for a lesson.
// Auth: teacher of the lesson's class (admin allowed).
//
// Pattern matches reviewer route:
//   - Auth → parse → role check → fetch lesson (RLS-gated) → rate limit
//   - Call Gemini with structured output
//   - Validate draft, persist via createFlashcardDeckWithCards
//   - Insert ai_generations row (status=draft for now; flips to 'published'
//     when teacher hits publish on the deck — see actions/flashcards.ts)
//   - Log to ai_usage_log
//
// Note: unlike the reviewer (which writes markdown to lesson body), this
// route writes ROWS to flashcard_decks + flashcards. The teacher reviews
// via the FlashcardDeckEditor UI and flips published=true when ready.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/client';
import { assertWithinRateLimit } from '@/lib/ai/rate-limit';
import { logUsage } from '@/lib/ai/log';
import { AIError, AIErrors } from '@/lib/ai/errors';
import {
  FLASHCARD_GENERATOR_SYSTEM_INSTRUCTION,
  FLASHCARD_GENERATOR_RESPONSE_SCHEMA,
  buildFlashcardGeneratorUserPrompt,
  validateFlashcardDraft,
  type FlashcardGeneratorDraft,
} from '@/lib/ai/prompts/flashcardGenerator';
import { createFlashcardDeckWithCards } from '@/lib/actions/flashcards';

export const runtime = 'nodejs';

type ReqBody = {
  lessonId?: string;
  desiredCount?: number;
  title?: string;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // 1. Auth
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    const e = AIErrors.unauthorized();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 2. Parse body
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    const e = AIErrors.badInput('invalid JSON body');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  const lessonId = body.lessonId?.trim();
  if (!lessonId) {
    const e = AIErrors.badInput('lessonId is required');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  const desiredCount = Math.min(
    20,
    Math.max(3, Number.isFinite(body.desiredCount) ? Number(body.desiredCount) : 10),
  );
  const deckTitle = (body.title ?? '').trim() || 'Flashcards';

  // 3. Role check
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || (profile.role !== 'teacher' && profile.role !== 'admin')) {
    const e = AIErrors.forbidden();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 4. Fetch lesson via RLS-gated query (chain enforces class teacher access)
  const { data: lessonRow, error: lessonErr } = await supabase
    .from('module_lessons')
    .select('id, title, body, module_id, class_modules!inner(class_id)')
    .eq('id', lessonId)
    .single();

  if (lessonErr || !lessonRow) {
    return NextResponse.json(
      { error: 'Lesson not found or you do not have access.' },
      { status: 404 },
    );
  }

  const lesson = lessonRow as unknown as {
    id: string;
    title: string;
    body: string;
    module_id: string;
    class_modules: { class_id: string } | { class_id: string }[];
  };
  const classId = Array.isArray(lesson.class_modules)
    ? lesson.class_modules[0]?.class_id
    : lesson.class_modules?.class_id;

  // 5. Rate limit
  try {
    await assertWithinRateLimit(supabase, user.id);
  } catch (err) {
    if (err instanceof AIError) {
      await logUsage(supabase, {
        userId: user.id,
        feature: 'flashcards',
        status: 'rate_limited',
      });
      return NextResponse.json({ error: err.userMessage }, { status: err.statusCode });
    }
    throw err;
  }

  // 6. Pre-flight: lesson must have substantive content
  const bodyText = (lesson.body || '').trim();
  if (bodyText.length < 100) {
    await logUsage(supabase, {
      userId: user.id,
      feature: 'flashcards',
      status: 'error',
      errorMessage: 'lesson too short for flashcards',
    });
    return NextResponse.json(
      {
        error:
          'This lesson is too short to generate flashcards from. Add more content first.',
      },
      { status: 422 },
    );
  }

  // 7. Call Gemini
  let draft: FlashcardGeneratorDraft;
  let modelUsed = '';
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const result = await generateText({
      model: 'fast',
      systemInstruction: FLASHCARD_GENERATOR_SYSTEM_INSTRUCTION,
      prompt: buildFlashcardGeneratorUserPrompt({
        lessonTitle: lesson.title,
        lessonBody: lesson.body,
        desiredCount,
      }),
      responseSchema: FLASHCARD_GENERATOR_RESPONSE_SCHEMA as unknown as Record<
        string,
        unknown
      >,
      temperature: 0.5,
    });
    modelUsed = result.modelUsed;
    tokensIn = result.tokens.input;
    tokensOut = result.tokens.output;

    let raw: unknown;
    try {
      raw = JSON.parse(result.text);
    } catch {
      throw AIErrors.geminiFailed('model returned non-JSON output');
    }
    draft = validateFlashcardDraft(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logUsage(supabase, {
      userId: user.id,
      feature: 'flashcards',
      model: modelUsed || undefined,
      inputTokens: tokensIn || undefined,
      outputTokens: tokensOut || undefined,
      status: 'error',
      errorMessage: message,
    });
    const status = err instanceof AIError ? err.statusCode : 500;
    const userMsg =
      err instanceof AIError
        ? err.userMessage
        : 'Failed to generate flashcards. Please try again.';
    return NextResponse.json({ error: userMsg }, { status });
  }

  // 8. Handle AI decline gracefully
  if (draft.errorMessage) {
    await logUsage(supabase, {
      userId: user.id,
      feature: 'flashcards',
      model: modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: 'success',
    });
    return NextResponse.json({
      ok: false,
      errorMessage: draft.errorMessage,
      tokens: { input: tokensIn, output: tokensOut },
    });
  }

  // 9. Insert ai_generations row (audit)
  const { data: gen, error: genErr } = await supabase
    .from('ai_generations')
    .insert({
      teacher_id: user.id,
      class_id: classId,
      feature: 'flashcards',
      status: 'draft',
      input_params: {
        lessonId,
        lessonTitle: lesson.title,
        desiredCount,
        deckTitle,
      },
      raw_output: draft as unknown as Record<string, unknown>,
      model_used: modelUsed,
      tokens_used: tokensIn + tokensOut,
    })
    .select('id')
    .single();

  if (genErr || !gen) {
    await logUsage(supabase, {
      userId: user.id,
      feature: 'flashcards',
      model: modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: 'error',
      errorMessage: `ai_generations insert failed: ${genErr?.message ?? 'unknown'}`,
    });
    return NextResponse.json(
      { error: 'Failed to save generation audit row.' },
      { status: 500 },
    );
  }

  const generationId = (gen as { id: string }).id;

  // 10. Persist deck + cards
  let result: { deckId: string; insertedCount: number };
  try {
    result = await createFlashcardDeckWithCards({
      lessonId,
      title: deckTitle,
      aiGenerationId: generationId,
      cards: draft.cards ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logUsage(supabase, {
      userId: user.id,
      feature: 'flashcards',
      model: modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: 'error',
      errorMessage: `deck insert failed: ${message}`,
    });
    return NextResponse.json(
      { error: 'Failed to save flashcard deck.' },
      { status: 500 },
    );
  }

  // 11. Log success
  await logUsage(supabase, {
    userId: user.id,
    feature: 'flashcards',
    model: modelUsed,
    inputTokens: tokensIn,
    outputTokens: tokensOut,
    status: 'success',
  });

  return NextResponse.json({
    ok: true,
    deckId: result.deckId,
    insertedCount: result.insertedCount,
    sourceNote: draft.sourceNote ?? null,
    generationId,
    tokens: { input: tokensIn, output: tokensOut },
  });
}