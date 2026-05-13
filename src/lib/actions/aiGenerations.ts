'use server';

// src/lib/actions/aiGenerations.ts
// Shared lifecycle helpers for ai_generations rows.
// Used by every AI feature (announcement, feedback, reviewer, quiz, etc.)

import { createClient } from '@/lib/supabase/server';

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  return { supabase, userId: user.id };
}

/**
 * Marks an ai_generations row as published, recording what the teacher
 * actually submitted (may differ from raw_output if they edited).
 * Best-effort: never throws — failure to update audit data must not
 * fail the user-visible publish path.
 */
export async function markAiGenerationPublished(
  generationId: string,
  editedOutput: Record<string, unknown>,
): Promise<void> {
  try {
    const { supabase } = await requireAuth();
    const { error } = await supabase
      .from('ai_generations')
      .update({
        status: 'published',
        edited_output: editedOutput,
        published_at: new Date().toISOString(),
      })
      .eq('id', generationId);
    if (error) {
      console.warn('[ai/gen] mark published failed:', error.message);
    }
  } catch (err) {
    console.warn('[ai/gen] mark published threw:', err);
  }
}

/**
 * Marks an ai_generations row as discarded. Best-effort.
 */
export async function markAiGenerationDiscarded(
  generationId: string,
): Promise<void> {
  try {
    const { supabase } = await requireAuth();
    const { error } = await supabase
      .from('ai_generations')
      .update({ status: 'discarded' })
      .eq('id', generationId);
    if (error) {
      console.warn('[ai/gen] mark discarded failed:', error.message);
    }
  } catch (err) {
    console.warn('[ai/gen] mark discarded threw:', err);
  }
}
