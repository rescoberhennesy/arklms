// src/app/api/ai/quiz/lessons/route.ts
// GET ?classId=... — return lessons for the lesson picker in AIQuizGenerator.
// RLS gates access; we just join module_lessons -> class_modules to filter
// by class_id.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AIErrors } from '@/lib/ai/errors';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    const e = AIErrors.unauthorized();
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  const classId = req.nextUrl.searchParams.get('classId')?.trim();
  if (!classId) {
    const e = AIErrors.badInput('classId is required');
    return NextResponse.json({ error: e.userMessage }, { status: e.statusCode });
  }

  // Fetch modules for the class first
  const { data: mods, error: modErr } = await supabase
    .from('class_modules')
    .select('id, title')
    .eq('class_id', classId);
  if (modErr) {
    return NextResponse.json({ error: modErr.message }, { status: 403 });
  }
  const modIds = (mods ?? []).map((m) => m.id);
  const modTitles = new Map<string, string>(
    (mods ?? []).map((m) => [m.id, m.title]),
  );

  if (modIds.length === 0) {
    return NextResponse.json({ lessons: [] });
  }

  const { data: lessons, error: lErr } = await supabase
    .from('module_lessons')
    .select('id, title, module_id, display_order')
    .in('module_id', modIds)
    .order('display_order', { ascending: true });
  if (lErr) {
    return NextResponse.json({ error: lErr.message }, { status: 403 });
  }

  return NextResponse.json({
    lessons: (lessons ?? []).map((l) => ({
      id: l.id,
      title: l.title,
      moduleTitle: modTitles.get(l.module_id) ?? '',
    })),
  });
}