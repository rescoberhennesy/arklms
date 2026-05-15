// src/app/api/ai/quiz/export/route.ts
//
// GET /api/ai/quiz/export?activityId=...&variant=student|teacher
//
// Returns a single PDF as an attachment download.
// Access control: teacher role + must be the class teacher for this activity.
// No AI call — pure data → PDF transform. Not logged to ai_generations.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTeacherQuizView } from '@/lib/actions/quizzes';
import { buildQuizPdf, PdfVariant } from '@/lib/ai/quizExport';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();

    // ------------------------------------------------------------------
    // Auth
    // ------------------------------------------------------------------
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('[export] user.id:', user.id);

    // ------------------------------------------------------------------
    // Params
    // ------------------------------------------------------------------
    const { searchParams } = new URL(req.url);
    const activityId = searchParams.get('activityId')?.trim();
    const variantRaw = searchParams.get('variant')?.trim();

    if (!activityId) {
      return NextResponse.json({ error: 'activityId is required' }, { status: 400 });
    }

    const variant: PdfVariant =
      variantRaw === 'teacher' ? 'teacher' : 'student';

    // ------------------------------------------------------------------
    // Role check — must be a teacher
    // ------------------------------------------------------------------
   const { data: roleRow } = await supabase
  .rpc('get_user_role', { user_id: user.id })
  .single();

if ((roleRow as unknown as string | null) !== 'teacher') {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
    // ------------------------------------------------------------------
    // Fetch activity to get class_id, then check is_class_teacher
    // ------------------------------------------------------------------
    const { data: actRow, error: actErr } = await supabase
      .from('activities')
      .select('id, class_id, title')
      .eq('id', activityId)
      .single();

    if (actErr || !actRow) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    }

 const { data: isTeacher } = await supabase
  .rpc('is_class_teacher', {
    p_class_id: actRow.class_id,
    p_user_id: user.id,
  });

console.log('[export] isTeacher raw:', isTeacher);

if (isTeacher !== true) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

    // ------------------------------------------------------------------
    // Fetch class name
    // ------------------------------------------------------------------
    const { data: classRow } = await supabase
      .from('classes')
      .select('name')
      .eq('id', actRow.class_id)
      .single();

    const className = (classRow as { name: string } | null)?.name ?? 'Unknown Class';

    // ------------------------------------------------------------------
    // Fetch quiz questions + config via existing server action
    // ------------------------------------------------------------------
    const quizView = await getTeacherQuizView(activityId);

    if (quizView.questions.length === 0) {
      return NextResponse.json(
        { error: 'This quiz has no questions to export.' },
        { status: 422 },
      );
    }

    // ------------------------------------------------------------------
    // Build PDF
    // ------------------------------------------------------------------
    const pdfBuffer = await buildQuizPdf({
      activityTitle: actRow.title as string,
      className,
      totalPoints: quizView.config.quizTotalPoints ?? quizView.questions.reduce((s, q) => s + q.points, 0),
      questions: quizView.questions,
      variant,
    });

    // ------------------------------------------------------------------
    // Filename
    // ------------------------------------------------------------------
    const safeName = (actRow.title as string)
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 60);

    const filename =
      variant === 'teacher'
        ? `${safeName}_TEACHER_COPY.pdf`
        : `${safeName}_student.pdf`;

    // ------------------------------------------------------------------
    // Stream response
    // ------------------------------------------------------------------
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.byteLength),
      },
    });
  } catch (err) {
    console.error('[quiz/export] error:', err);
    return NextResponse.json(
      { error: 'Failed to generate PDF. Please try again.' },
      { status: 500 },
    );
  }
}