'use server';

// src/lib/actions/calendarToken.ts
//
// Session 13 — calendar subscription token actions.
//
// The token is stored on profiles.calendar_token and is the credential for
// /calendar/[token]/route.ts (the .ics endpoint). Calendar clients like
// Google and Apple Calendar can't send Supabase auth cookies, so the URL
// itself has to carry access. Token is 32 random bytes base64url-encoded.
//
// Reads/writes here go through the session-scoped supabase client and rely
// on the existing profile RLS (self-service select + update). The .ics
// route handler does NOT use this module — it uses a service-role client to
// look up the profile by token, which is the only place in the codebase
// that bypasses RLS.

import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';

// 32 bytes -> 43 base64url chars. URL-safe, no padding.
function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

// Returns the user's existing calendar_token, lazy-creating one if absent.
// Idempotent: calling this multiple times for the same user returns the
// same token (until regenerateCalendarToken is called).
export async function getOrCreateCalendarToken(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: existing, error: readErr } = await supabase
    .from('profiles')
    .select('calendar_token')
    .eq('id', user.id)
    .single();
  if (readErr) throw new Error(`Failed to read profile: ${readErr.message}`);

  const row = existing as { calendar_token: string | null };
  if (row.calendar_token) return row.calendar_token;

  // Lazy-create. Tiny window where two parallel calls could both INSERT,
  // but the unique index would catch the loser; in practice this is one-
  // shot UI ("Subscribe" button click) so the race is moot.
  const token = generateToken();
  const { error: writeErr } = await supabase
    .from('profiles')
    .update({ calendar_token: token })
    .eq('id', user.id);
  if (writeErr) {
    throw new Error(`Failed to save calendar token: ${writeErr.message}`);
  }
  return token;
}

// Overwrites the existing token. The old URL stops working immediately.
// Use case: user suspects the URL was shared, wants to revoke access.
export async function regenerateCalendarToken(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const token = generateToken();
  const { error } = await supabase
    .from('profiles')
    .update({ calendar_token: token })
    .eq('id', user.id);
  if (error) {
    throw new Error(`Failed to regenerate calendar token: ${error.message}`);
  }
  return token;
}
