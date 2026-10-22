// src/lib/ai/client.ts
// Gemini client singleton + thin call wrapper.
// Server-only. NEVER import from a client component.

import { GoogleGenAI } from "@google/genai";
import { AIErrors } from "./errors";
import type { AIModel, TokenUsage } from "./types";

let _client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw AIErrors.geminiFailed("GEMINI_API_KEY is not set");
  }
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

function resolveModel(model: AIModel): string {
  return model === "pro"
    ? process.env.GEMINI_MODEL_PRO ?? "gemini-2.5-pro"
    : process.env.GEMINI_MODEL_FAST ?? "gemini-2.5-flash";
}

export type GenerateTextOptions = {
  model?: AIModel;
  systemInstruction?: string;
  /**
   * Either a plain text prompt OR an array of Gemini Content parts
   * (e.g. for multipart: [{fileData: ...}, {text: ...}]).
   */
  prompt: string | unknown[];
  /** If provided, Gemini will be forced to return JSON matching this schema. */
  responseSchema?: Record<string, unknown>;
  /** Lower = more deterministic. Default 0.7. */
  temperature?: number;
};

export type GenerateTextResult = {
  text: string;
  modelUsed: string;
  tokens: TokenUsage;
};

/**
 * One-shot text generation.
 * - Retries on 429/5xx/timeouts.
 * - If the main model is overloaded or out of quota, falls back to
 *   flash-lite (separate, bigger free quota).
 * - If the DAILY quota is gone, skips straight to the fallback.
 * Returns the full text plus token usage so the caller can log it.
 */
export async function generateText(
  opts: GenerateTextOptions,
): Promise<GenerateTextResult> {
  const client = getClient();
  const modelName = resolveModel(opts.model ?? "fast");

  const config: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.7,
  };
  if (opts.systemInstruction) config.systemInstruction = opts.systemInstruction;
  if (opts.responseSchema) {
    config.responseMimeType = "application/json";
    config.responseSchema = opts.responseSchema;
  }

  const fallback = process.env.GEMINI_MODEL_FALLBACK ?? "gemini-2.5-flash-lite";
  const plan: { model: string; attempts: number }[] =
    modelName === fallback
      ? [{ model: modelName, attempts: 3 }]
      : [
          { model: modelName, attempts: 2 },
          { model: fallback, attempts: 2 },
        ];

  let lastErr: unknown;

  for (const step of plan) {
    for (let attempt = 1; attempt <= step.attempts; attempt++) {
      try {
        const res = await client.models.generateContent({
          model: step.model,
          // Cast through unknown to satisfy both string and Content[] shapes.
          contents: opts.prompt as unknown as string,
          config,
        });

        const text = res.text ?? "";
        const usage = res.usageMetadata;
        return {
          text,
          modelUsed: step.model,
          tokens: {
            input: usage?.promptTokenCount ?? 0,
            output: usage?.candidatesTokenCount ?? 0,
          },
        };
      } catch (err: unknown) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[ai/client] ${step.model} attempt ${attempt} failed:`,
          msg.slice(0, 300),
        );

        const retryable =
          /429|5\d\d|overloaded|unavailable|RESOURCE_EXHAUSTED|timeout|ECONNRESET/i.test(msg);
        if (!retryable) {
          throw AIErrors.geminiFailed(msg);
        }

        // Daily quota gone: retrying this model won't help, go to the fallback
        if (/PerDay/i.test(msg)) break;

        if (attempt < step.attempts) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
    }
  }

  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw AIErrors.geminiFailed(detail);
}