// src/app/api/ai/ping/route.ts
// Phase 1 smoke test. Exercises: auth -> role -> rate limit -> Gemini -> log.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText } from "@/lib/ai/client";
import { assertWithinRateLimit } from "@/lib/ai/rate-limit";
import { logUsage } from "@/lib/ai/log";
import { AIError, AIErrors } from "@/lib/ai/errors";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();

  // 1. Auth
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    const e = AIErrors.unauthorized();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 2. Role check
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) {
    const e = AIErrors.forbidden();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  if (profile.role !== "teacher" && profile.role !== "admin") {
    const e = AIErrors.forbidden();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 3. Rate limit
  try {
    await assertWithinRateLimit(supabase, user.id);
  } catch (err) {
    if (err instanceof AIError) {
      await logUsage(supabase, {
        userId: user.id,
        feature: "ping",
        status: "rate_limited",
      });
      return NextResponse.json(
        { error: err.userMessage },
        { status: err.statusCode },
      );
    }
    throw err;
  }

  // 4. Call Gemini
  try {
    const result = await generateText({
      model: "fast",
      prompt: "Respond with exactly the single word: PONG",
      temperature: 0,
    });

    // 5. Log success
    await logUsage(supabase, {
      userId: user.id,
      feature: "ping",
      model: result.modelUsed,
      inputTokens: result.tokens.input,
      outputTokens: result.tokens.output,
      status: "success",
    });

    return NextResponse.json({
      ok: true,
      reply: result.text.trim(),
      model: result.modelUsed,
      tokens: result.tokens,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logUsage(supabase, {
      userId: user.id,
      feature: "ping",
      status: "error",
      errorMessage: message,
    });
    const status = err instanceof AIError ? err.statusCode : 500;
    const userMsg =
      err instanceof AIError ? err.userMessage : "Unexpected server error.";
    return NextResponse.json({ error: userMsg }, { status });
  }
}
