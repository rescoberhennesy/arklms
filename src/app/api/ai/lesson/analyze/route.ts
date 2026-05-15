
// src/app/api/ai/lesson/analyze/route.ts
//
// POST: analyze a single lesson's content quality.
// Auth: teacher of the class containing the lesson (admin allowed).
//
// NOTE: per Lesson Analyzer design (matches analytics pattern), this is a
// read-only diagnostic. We log to ai_usage_log only — NOT ai_generations.
// The analyzer NEVER mutates module_lessons.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/client';
import { assertWithinRateLimit } from '@/lib/ai/rate-limit';
import { logUsage } from '@/lib/ai/log';
import { AIError, AIErrors } from '@/lib/ai/errors';
import { computeLessonMetrics } from '@/lib/ai/readability';
import {
  LESSON_ANALYZER_SYSTEM_INSTRUCTION,
  LESSON_ANALYZER_RESPONSE_SCHEMA,
  buildLessonAnalyzerUserPrompt,
  validateLessonAnalysisDraft,
  type LessonAnalysisDraft,
} from '@/lib/ai/prompts/lessonAnalyzer';

export const runtime = 'nodejs';

type ReqBody = { lessonId?: string };

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

  // 3. Role check (teacher or admin)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || (profile.role !== 'teacher' && profile.role !== 'admin')) {
    const e = AIErrors.forbidden();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 4. Fetch lesson via the module → class chain. RLS enforces that only the
  //    class's teacher (or admin) can read this; non-owners get nothing.
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
        feature: 'lesson_analysis',
        status: 'rate_limited',
      });
      return NextResponse.json({ error: err.userMessage }, { status: err.statusCode });
    }
    throw err;
  }

  // 6. Compute metrics (CODE does the math — Flesch, word count, language flag)
  const metrics = computeLessonMetrics(lesson.body || '');

  // Guard: lesson too short to analyze. Don't burn a Gemini call.
  if (metrics.stats.words < 50) {
    await logUsage(supabase, {
      userId: user.id,
      feature: 'lesson_analysis',
      status: 'error',
      errorMessage: `too short to analyze (${metrics.stats.words} words)`,
    });
    return NextResponse.json({
      draft: {
        errorMessage:
          'This lesson is too short to analyze. Please write at least a few paragraphs of lesson content first.',
      } satisfies LessonAnalysisDraft,
      metrics,
    });
  }

  // 7. Call Gemini
  let draft: LessonAnalysisDraft;
  let modelUsed = '';
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const result = await generateText({
      model: 'fast',
      systemInstruction: LESSON_ANALYZER_SYSTEM_INSTRUCTION,
      prompt: buildLessonAnalyzerUserPrompt({
        lessonTitle: lesson.title,
        lessonBody: lesson.body,
        metrics,
      }),
      responseSchema: LESSON_ANALYZER_RESPONSE_SCHEMA as unknown as Record<
        string,
        unknown
      >,
      temperature: 0.3,
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
    
    draft = validateLessonAnalysisDraft(raw);


  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logUsage(supabase, {
      userId: user.id,
      feature: 'lesson_analysis',
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
        : 'Failed to analyze lesson. Please try again.';
    return NextResponse.json({ error: userMsg }, { status });
  }

  // 8. Log success (no ai_generations — read-only diagnostic)
  await logUsage(supabase, {
    userId: user.id,
    feature: 'lesson_analysis',
    model: modelUsed,
    inputTokens: tokensIn,
    outputTokens: tokensOut,
    status: 'success',
  });

  return NextResponse.json({
    draft,
    metrics,
    classId,
    tokens: { input: tokensIn, output: tokensOut },
  });
}
