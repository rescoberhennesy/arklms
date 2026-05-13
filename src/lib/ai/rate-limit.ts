// src/lib/ai/rate-limit.ts
// Per-user hourly rate limit backed by ai_usage_log.

import type { SupabaseClient } from "@supabase/supabase-js";
import { AIErrors } from "./errors";

function getLimit(): number {
  const raw = process.env.AI_RATE_LIMIT_PER_HOUR;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 20;
}

/**
 * Throws AIErrors.rateLimited if the user has hit the hourly cap.
 * Counts only 'success' rows so failed calls don't punish the user.
 */
export async function assertWithinRateLimit(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const limit = getLimit();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "success")
    .gte("created_at", oneHourAgo);

  if (error) {
    console.warn("[ai/rate-limit] count query failed:", error.message);
    return;
  }

  if ((count ?? 0) >= limit) {
    throw AIErrors.rateLimited(limit);
  }
}
