// src/app/api/ai/feedback/submission/route.ts
// POST: generate feedback for a single activity submission.
// Auth: teacher of the activity's class (admin allowed).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText } from "@/lib/ai/client";
import { assertWithinRateLimit } from "@/lib/ai/rate-limit";
import { logUsage } from "@/lib/ai/log";
import { AIError, AIErrors } from "@/lib/ai/errors";
import {
  FEEDBACK_SYSTEM_INSTRUCTION,
  FEEDBACK_RESPONSE_SCHEMA,
  buildFeedbackUserPrompt,
  type FeedbackDraft,
} from "@/lib/ai/prompts/feedback";

export const runtime = "nodejs";

type ReqBody = {
  submissionId?: string;
  score?: number;
};

export async function POST(req: NextRequest) {
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

  // 2. Parse body
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    const e = AIErrors.badInput("invalid JSON body");
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  const submissionId = body.submissionId?.trim();
  const score = typeof body.score === "number" ? body.score : null;

  if (!submissionId) {
    const e = AIErrors.badInput("submissionId is required");
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  if (score === null || !Number.isFinite(score) || score < 0) {
    const e = AIErrors.badInput("a non-negative score is required");
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 3. Role check
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) {
    const e = AIErrors.forbidden();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 4. Fetch submission + activity + attachments.
  //    RLS already filters to teacher-of-class; an empty result = unauthorized.
  const { data: sub, error: subErr } = await supabase
    .from("activity_submissions")
    .select(`
      id, text_body,
      activity:activity_id (
        id, title, instructions, max_points, class_id
      )
    `)
    .eq("id", submissionId)
    .single();

  if (subErr || !sub || !sub.activity) {
    const e = AIErrors.forbidden();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // Supabase typing returns activity as array-like in some cases; normalize.
  const activity = Array.isArray(sub.activity) ? sub.activity[0] : sub.activity;
  if (!activity) {
    const e = AIErrors.forbidden();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  if (score > Number(activity.max_points)) {
    const e = AIErrors.badInput(`score exceeds max points (${activity.max_points})`);
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // Attachments — filenames only
  const { data: atts } = await supabase
    .from("submission_attachments")
    .select("file_name")
    .eq("submission_id", submissionId);
  const attachmentFileNames = (atts ?? []).map((a) => a.file_name);

  // 5. Rate limit
  try {
    await assertWithinRateLimit(supabase, user.id);
  } catch (err) {
    if (err instanceof AIError) {
      await logUsage(supabase, {
        userId: user.id,
        feature: "feedback",
        status: "rate_limited",
      });
      return NextResponse.json(
        { error: err.userMessage },
        { status: err.statusCode },
      );
    }
    throw err;
  }

  // 6. Call Gemini
  let draft: FeedbackDraft;
  let modelUsed = "";
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const result = await generateText({
      model: "fast",
      systemInstruction: FEEDBACK_SYSTEM_INSTRUCTION,
      prompt: buildFeedbackUserPrompt({
        activityTitle: activity.title,
        activityInstructions: activity.instructions,
        maxPoints: Number(activity.max_points),
        score,
        studentTextBody: sub.text_body,
        attachmentFileNames,
      }),
      responseSchema: FEEDBACK_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.5,
    });

    modelUsed = result.modelUsed;
    tokensIn = result.tokens.input;
    tokensOut = result.tokens.output;

    try {
      draft = JSON.parse(result.text) as FeedbackDraft;
    } catch {
      throw AIErrors.geminiFailed("model returned non-JSON output");
    }

    if (typeof draft.feedback !== "string" || typeof draft.tone !== "string") {
      throw AIErrors.geminiFailed("model output missing required fields");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logUsage(supabase, {
      userId: user.id,
      feature: "feedback",
      status: "error",
      errorMessage: message,
    });
    const status = err instanceof AIError ? err.statusCode : 500;
    const userMsg =
      err instanceof AIError ? err.userMessage : "Failed to generate feedback.";
    return NextResponse.json({ error: userMsg }, { status });
  }

  // 7. Persist draft
  const { data: gen, error: genErr } = await supabase
    .from("ai_generations")
    .insert({
      teacher_id: user.id,
      class_id: activity.class_id,
      feature: "feedback",
      status: "draft",
      input_params: {
        submissionId,
        score,
        activityId: activity.id,
        scoreBand:
          (score / Number(activity.max_points)) * 100 >= 85
            ? "HIGH"
            : (score / Number(activity.max_points)) * 100 >= 60
              ? "MID"
              : "LOW",
      },
      raw_output: draft,
      model_used: modelUsed,
      tokens_used: tokensIn + tokensOut,
    })
    .select("id")
    .single();

  if (genErr || !gen) {
    await logUsage(supabase, {
      userId: user.id,
      feature: "feedback",
      model: modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: "error",
      errorMessage: `draft persistence failed: ${genErr?.message ?? "unknown"}`,
    });
    return NextResponse.json(
      {
        warning: "Draft generated but could not be saved.",
        draft,
      },
      { status: 200 },
    );
  }

  // 8. Log success
  await logUsage(supabase, {
    userId: user.id,
    feature: "feedback",
    model: modelUsed,
    inputTokens: tokensIn,
    outputTokens: tokensOut,
    status: "success",
  });

  return NextResponse.json({
    generationId: gen.id,
    draft,
    tokens: { input: tokensIn, output: tokensOut },
  });
}
