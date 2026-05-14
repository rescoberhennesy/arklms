// src/app/api/ai/analytics/class/route.ts
// POST: generate at-risk student insights for a class.
// Auth: teacher of the class (admin allowed).
// NOTE: per Feature 4 design, analytics insights are read-only diagnostics.
// We log to ai_usage_log only, NOT ai_generations (no draft/publish flow).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/client';
import { assertWithinRateLimit } from '@/lib/ai/rate-limit';
import { logUsage } from '@/lib/ai/log';
import { AIError, AIErrors } from '@/lib/ai/errors';
import { getClassStudentStats } from '@/lib/actions/analytics';
import {
  CLASS_INSIGHT_SYSTEM_INSTRUCTION,
  CLASS_INSIGHT_RESPONSE_SCHEMA,
  buildClassInsightUserPrompt,
  type ClassInsightDraft,
} from '@/lib/ai/prompts/analytics';

export const runtime = 'nodejs';

type ReqBody = { classId?: string };

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
  const classId = body.classId?.trim();
  if (!classId) {
    const e = AIErrors.badInput('classId is required');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

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

  // 4. Rate limit
  try {
    await assertWithinRateLimit(supabase, user.id);
  } catch (err) {
    if (err instanceof AIError) {
      await logUsage(supabase, {
        userId: user.id,
        feature: 'analytics_insight',
        status: 'rate_limited',
      });
      return NextResponse.json({ error: err.userMessage }, { status: err.statusCode });
    }
    throw err;
  }

  // 5. Compute stats (SQL does all math). RLS gates class access.
  let stats: Awaited<ReturnType<typeof getClassStudentStats>>;
  try {
    stats = await getClassStudentStats(classId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logUsage(supabase, {
      userId: user.id,
      feature: 'analytics_insight',
      status: 'error',
      errorMessage: `stats query failed: ${msg}`,
    });
    return NextResponse.json(
      { error: 'Could not load class data.' },
      { status: 403 },
    );
  }

  // 6. Call Gemini
  let draft: ClassInsightDraft;
  let modelUsed = '';
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const result = await generateText({
      model: 'fast',
      systemInstruction: CLASS_INSIGHT_SYSTEM_INSTRUCTION,
      prompt: buildClassInsightUserPrompt(stats),
      responseSchema: CLASS_INSIGHT_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.4,
    });
    modelUsed = result.modelUsed;
    tokensIn = result.tokens.input;
    tokensOut = result.tokens.output;

    try {
      draft = JSON.parse(result.text) as ClassInsightDraft;
    } catch {
      throw AIErrors.geminiFailed('model returned non-JSON output');
    }
    if (
      typeof draft.summary !== 'string' ||
      !Array.isArray(draft.atRiskNotes) ||
      typeof draft.bright_spots !== 'string'
    ) {
      throw AIErrors.geminiFailed('model output missing required fields');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logUsage(supabase, {
      userId: user.id,
      feature: 'analytics_insight',
      model: modelUsed || undefined,
      inputTokens: tokensIn || undefined,
      outputTokens: tokensOut || undefined,
      status: 'error',
      errorMessage: message,
    });
    const status = err instanceof AIError ? err.statusCode : 500;
    const userMsg =
      err instanceof AIError ? err.userMessage : 'Failed to generate insights.';
    return NextResponse.json({ error: userMsg }, { status });
  }

  // 7. Log success (no ai_generations row — read-only diagnostic)
  await logUsage(supabase, {
    userId: user.id,
    feature: 'analytics_insight',
    model: modelUsed,
    inputTokens: tokensIn,
    outputTokens: tokensOut,
    status: 'success',
  });

  return NextResponse.json({
    draft,
    tokens: { input: tokensIn, output: tokensOut },
  });
}