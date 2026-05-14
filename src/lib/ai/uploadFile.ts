// src/lib/ai/uploadFile.ts
// Helper for uploading source files to the Gemini File API.
// Server-only. NEVER import from a client component.
//
// Returns a { fileUri, mimeType } that can be passed in `generateText`'s
// `prompt` array as a fileData part. Files auto-expire at ~48h.

import { GoogleGenAI } from '@google/genai';
import { AIErrors } from './errors';

let _client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw AIErrors.geminiFailed('GEMINI_API_KEY is not set');
  }
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

export type UploadedFile = {
  fileUri: string;
  mimeType: string;
  name: string;
  displayName: string;
};

/**
 * Upload one file to Gemini. The SDK accepts a Blob, Buffer, or file path;
 * we standardize on Blob for the multipart route flow.
 */
export async function uploadFileToGemini(input: {
  data: Blob;
  mimeType: string;
  displayName: string;
}): Promise<UploadedFile> {
  const client = getClient();
  try {
    const result = await client.files.upload({
      file: input.data,
      config: {
        mimeType: input.mimeType,
        displayName: input.displayName,
      },
    });

    // SDK shape: { uri, name, mimeType, ... }. Defensive reads.
    const uri =
      (result as { uri?: string }).uri ??
      (result as { file?: { uri?: string } }).file?.uri ??
      '';
    const name =
      (result as { name?: string }).name ??
      (result as { file?: { name?: string } }).file?.name ??
      '';

    if (!uri) {
      throw AIErrors.geminiFailed('Gemini file upload returned no URI');
    }

    return {
      fileUri: uri,
      mimeType: input.mimeType,
      name,
      displayName: input.displayName,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw AIErrors.geminiFailed(`file upload failed: ${msg}`);
  }
}

/**
 * Convenience: upload multiple files in parallel. Bounded at the caller
 * level (route enforces a max of 5).
 */
export async function uploadFilesToGemini(
  inputs: Array<{ data: Blob; mimeType: string; displayName: string }>,
): Promise<UploadedFile[]> {
  return Promise.all(inputs.map((i) => uploadFileToGemini(i)));
}

/**
 * Build a Gemini Content "parts" array from uploaded files + a text prompt.
 * Pass the result as `prompt` to generateText().
 */
export function buildPartsWithFiles(
  files: UploadedFile[],
  text: string,
): unknown[] {
  const fileParts = files.map((f) => ({
    fileData: {
      mimeType: f.mimeType,
      fileUri: f.fileUri,
    },
  }));
  return [...fileParts, { text }];
}
