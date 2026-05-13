// src/app/api/ai/announcement/route.ts
// POST: generate an announcement draft from a teacher's casual note.
// Auth: teacher of the class only (admin allowed).
// Persists draft to ai_generations so the publish step can mark it published.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText } from "@/lib/ai/client";
import { assertWithinRateLimit } from "@/lib/ai/rate-limit";
import { logUsage } from "@/lib/ai/log";
import { AIError, AIErrors } from "@/lib/ai/errors";
import {
  ANNOUNCEMENT_SYSTEM_INSTRUCTION,
  ANNOUNCEMENT_RESPONSE_SCHEMA,
  buildAnnouncementUserPrompt,
  type AnnouncementDraft,
} from "@/lib/ai/prompts/announcement";

export const runtime = "nodejs";

const MAX_NOTE_LEN = 2000;
const MIN_NOTE_LEN = 3;

type ReqBody = {
  classId?: string;
  rawNote?: string;
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

  // 2. Parse + validate input
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    const e = AIErrors.badInput("invalid JSON body");
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  const classId = body.classId?.trim();
  const rawNote = body.rawNote?.trim();

  if (!classId) {
    const e = AIErrors.badInput("classId is required");
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  if (!rawNote || rawNote.length < MIN_NOTE_LEN) {
    const e = AIErrors.badInput("note is too short");
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }
  if (rawNote.length > MAX_NOTE_LEN) {
    const e = AIErrors.badInput("note is too long");
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // 3. Permission check — must be teacher of this class (or admin).
  //    RLS on classes already restricts SELECT to teacher/admin, so a hit
  //    here proves authorization.
  const { data: classRow, error: classErr } = await supabase
    .from("classes")
    .select("id, name, section, semester, teacher_id")
    .eq("id", classId)
    .single();

  if (classErr || !classRow) {
    const e = AIErrors.forbidden();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // Belt + suspenders: check role too
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) {
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
        feature: "announcement",
        status: "rate_limited",
      });
      return NextResponse.json(
        { error: err.userMessage },
        { status: err.statusCode },
      );
    }
    throw err;
  }

  // 5. Call Gemini
  let draft: AnnouncementDraft;
  let modelUsed = "";
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const result = await generateText({
      model: "fast",
      systemInstruction: ANNOUNCEMENT_SYSTEM_INSTRUCTION,
      prompt: buildAnnouncementUserPrompt({
        rawNote,
        className: classRow.name,
        section: classRow.section,
        semester: classRow.semester,
      }),
      responseSchema: ANNOUNCEMENT_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.4,
    });

    modelUsed = result.modelUsed;
    tokensIn = result.tokens.input;
    tokensOut = result.tokens.output;

    try {
      draft = JSON.parse(result.text) as AnnouncementDraft;
    } catch {
      throw AIErrors.geminiFailed("model returned non-JSON output");
    }

    if (
      typeof draft.title !== "string" ||
      typeof draft.body !== "string" ||
      typeof draft.tone !== "string"
    ) {
      throw AIErrors.geminiFailed("model output missing required fields");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logUsage(supabase, {
      userId: user.id,
      feature: "announcement",
      status: "error",
      errorMessage: message,
    });
    const status = err instanceof AIError ? err.statusCode : 500;
    const userMsg =
      err instanceof AIError ? err.userMessage : "Failed to generate announcement.";
    return NextResponse.json({ error: userMsg }, { status });
  }

  // 6. Persist draft (so publish step can mark it published later)
  const { data: gen, error: genErr } = await supabase
    .from("ai_generations")
    .insert({
      teacher_id: user.id,
      class_id: classId,
      feature: "announcement",
      status: "draft",
      input_params: { rawNote, classContext: { name: classRow.name, section: classRow.section } },
      raw_output: draft,
      model_used: modelUsed,
      tokens_used: tokensIn + tokensOut,
    })
    .select("id")
    .single();

  if (genErr || !gen) {
    // Persistence failed but we still got a draft. Surface that to the user
    // so they can copy it manually rather than losing the work.
    await logUsage(supabase, {
      userId: user.id,
      feature: "announcement",
      model: modelUsed,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: "error",
      errorMessage: `draft persistence failed: ${genErr?.message ?? "unknown"}`,
    });
    return NextResponse.json(
      {
        warning: "Draft generated but could not be saved. You can still use it.",
        draft,
      },
      { status: 200 },
    );
  }

  // 7. Log success
  await logUsage(supabase, {
    userId: user.id,
    feature: "announcement",
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
