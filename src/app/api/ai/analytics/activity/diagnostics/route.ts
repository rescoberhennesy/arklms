// src/app/api/ai/analytics/activity/diagnostics/route.ts
// GET ?id=<activityId> — returns pre-computed diagnostics WITHOUT calling AI.
// Used by the diagnostics panel to render the chart before/without
// generating reteaching suggestions. NOT rate-limited (pure DB read, RLS-gated).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AIErrors } from '@/lib/ai/errors';
import { getActivityDiagnostics } from '@/lib/actions/analytics';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    const e = AIErrors.unauthorized();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || (profile.role !== 'teacher' && profile.role !== 'admin')) {
    const e = AIErrors.forbidden();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  const activityId = req.nextUrl.searchParams.get('id')?.trim();
  if (!activityId) {
    const e = AIErrors.badInput('id is required');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  try {
    const diagnostics = await getActivityDiagnostics(activityId);
    return NextResponse.json({ diagnostics });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 403 });
  }
}