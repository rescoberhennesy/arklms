// src/lib/ai/log.ts
// Write rows to ai_usage_log. Best-effort: never throws.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIFeature, UsageStatus } from "./types";

export type LogUsageInput = {
  userId: string;
  feature: AIFeature;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  status: UsageStatus;
  errorMessage?: string;
};

export async function logUsage(
  supabase: SupabaseClient,
  input: LogUsageInput,
): Promise<void> {
  try {
    const { error } = await supabase.from("ai_usage_log").insert({
      user_id: input.userId,
      feature: input.feature,
      model: input.model ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      status: input.status,
      error_message: input.errorMessage ?? null,
    });
    if (error) {
      console.warn("[ai/log] insert failed:", error.message);
    }
  } catch (err) {
    console.warn("[ai/log] threw:", err);
  }
}
