'use server';

import { createClient } from '@/lib/supabase/server';

export type JoinPreviewStatus =
  | 'valid'
  | 'not_found'
  | 'disabled'
  | 'expired'
  | 'already_enrolled'
  | 'request_pending';

export type JoinPreviewResult = {
  status: JoinPreviewStatus;
  class_id: string | null;
  class_name: string | null;
  class_section: string | null;
  class_semester: string | null;
  class_color: string | null;
  teacher_name: string | null;
};

export async function previewClassByCode(
  code: string,
): Promise<JoinPreviewResult> {
  const supabase = await createClient();
  const trimmed = code.trim();
  if (!trimmed) throw new Error('Missing invite code');

  const { data, error } = await supabase.rpc('preview_class_by_code', {
    p_code: trimmed,
  });

  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Empty preview response');

  return {
    status: row.status as JoinPreviewStatus,
    class_id: row.class_id ?? null,
    class_name: row.class_name ?? null,
    class_section: row.class_section ?? null,
    class_semester: row.class_semester ?? null,
    class_color: row.class_color ?? null,
    teacher_name: row.teacher_name ?? null,
  };
}
