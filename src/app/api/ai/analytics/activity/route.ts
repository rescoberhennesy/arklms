// src/app/api/ai/analytics/activity/route.ts
// POST: generate reteaching suggestions for a single activity.
// Auth: teacher of the activity's class (admin allowed).
// Log to ai_usage_log only (read-only diagnostic).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/client';
import { assertWithinRateLimit } from '@/lib/ai/rate-limit';
import { logUsage } from '@/lib/ai/log';
import { AIError, AIErrors } from '@/lib/ai/errors';
import { getActivityDiagnostics } from '@/lib/actions/analytics';
import {
  RETEACH_SYSTEM_INSTRUCTION,
  RETEACH_RESPONSE_SCHEMA,
  buildReteachUserPrompt,
  type ReteachDraft,
} from '@/lib/ai/prompts/analytics';

export const runtime = 'nodejs';

type ReqBody = { activityId?: string };

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
  const activityId = body.activityId?.trim();
  if (!activityId) {
    const e = AIErrors.badInput('activityId is required');
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

  // 5. Compute diagnostics
  let diag: Awaited<ReturnType<typeof getActivityDiagnostics>>;
  try {
    diag = await getActivityDiagnostics(activityId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logUsage(supabase, {
      userId: user.id,
      feature: 'analytics_insight',
      status: 'error',
      errorMessage: `diagnostics query failed: ${msg}`,
    });
    return NextResponse.json(
      { error: 'Could not load activity data.' },
      { status: 403 },
    );
  }

  // 6. Build prompt input matching the diagnostic kind
  const promptInput =
    diag.kind === 'quiz'
      ? {
          kind: 'quiz' as const,
          activityTitle: diag.activityTitle,
          totalAttempts: diag.totalAttempts,
          meanScorePct: diag.meanScorePct,
          questions: diag.questions,
        }
      : {
          kind: 'assignment' as const,
          activityTitle: diag.activityTitle,
          totalEnrolled: diag.totalEnrolled,
          submissionCount: diag.submissionCount,
          gradedCount: diag.gradedCount,
          meanScorePct: diag.meanScorePct,
          passRate: diag.passRate,
          failRate: diag.failRate,
          distribution: diag.distribution,
        };

  // 7. Call Gemini
  let draft: ReteachDraft;
  let modelUsed = '';
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const result = await generateText({
      model: 'fast',
      systemInstruction: RETEACH_SYSTEM_INSTRUCTION,
      prompt: buildReteachUserPrompt(promptInput),
      responseSchema: RETEACH_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.5,
    });
    modelUsed = result.modelUsed;
    tokensIn = result.tokens.input;
    tokensOut = result.tokens.output;

    try {
      draft = JSON.parse(result.text) as ReteachDraft;
    } catch {
      throw AIErrors.geminiFailed('model returned non-JSON output');
    }
    if (typeof draft.summary !== 'string' || !Array.isArray(draft.suggestions)) {
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
      err instanceof AIError ? err.userMessage : 'Failed to generate suggestions.';
    return NextResponse.json({ error: userMsg }, { status });
  }

  // 8. Log success
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