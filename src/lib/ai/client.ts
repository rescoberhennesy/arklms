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
 * One-shot text generation with retry on 429/5xx.
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

  const maxAttempts = 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await client.models.generateContent({
        model: modelName,
        // Cast through unknown to satisfy both string and Content[] shapes.
        // String callers behave exactly as before.
        contents: opts.prompt as unknown as string,
        config,
      });

      const text = res.text ?? "";
      const usage = res.usageMetadata;
      return {
        text,
        modelUsed: modelName,
        tokens: {
          input: usage?.promptTokenCount ?? 0,
          output: usage?.candidatesTokenCount ?? 0,
        },
      };
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = /429|5\d\d|timeout|ECONNRESET/i.test(msg);
      if (!retryable || attempt === maxAttempts) break;
      const delayMs = 2 ** (attempt - 1) * 1000;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw AIErrors.geminiFailed(detail);
}
