'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ModuleTerm } from '@/lib/types/modules';
import { notifyModuleCreated } from '@/lib/actions/notifications';
import { notifyLessonPublished } from '@/lib/actions/notifications';

// ---------- Types ----------

export type ModuleSummary = {
  id: string;
  class_id: string;
  title: string;
  description: string;
  term: ModuleTerm;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type LessonSummary = {
  id: string;
  module_id: string;
  title: string;
  published: boolean;
  published_at: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type ModuleWithLessons = ModuleSummary & {
  lessons: LessonSummary[];
};

export type LessonAttachment = {
  id: string;
  lesson_id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  uploaded_at: string;
};

export type LessonDetail = LessonSummary & {
  body: string;
  class_id: string;
  attachments: LessonAttachment[];
};

// ---------- Helpers ----------

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  return { supabase, userId: user.id };
}

// ---------- Module actions ----------

export async function listModulesWithLessons(
  classId: string,
): Promise<ModuleWithLessons[]> {
  const { supabase } = await requireAuth();

  const { data: modules, error: modErr } = await supabase
    .from('class_modules')
    .select('id, class_id, title, description, term, display_order, created_at, updated_at')
    .eq('class_id', classId)
    .order('term', { ascending: true })
    .order('display_order', { ascending: true });

  if (modErr) throw new Error(`Failed to list modules: ${modErr.message}`);
  if (!modules || modules.length === 0) return [];

  const moduleIds = modules.map((m) => m.id);

  const { data: lessons, error: lessErr } = await supabase
    .from('module_lessons')
    .select('id, module_id, title, published, published_at, display_order, created_at, updated_at')
    .in('module_id', moduleIds)
    .order('display_order', { ascending: true });

  if (lessErr) throw new Error(`Failed to list lessons: ${lessErr.message}`);

  const lessonsByModule = new Map<string, LessonSummary[]>();
  for (const l of lessons ?? []) {
    const arr = lessonsByModule.get(l.module_id) ?? [];
    arr.push(l as LessonSummary);
    lessonsByModule.set(l.module_id, arr);
  }

  return modules.map((m) => ({
    ...(m as ModuleSummary),
    lessons: lessonsByModule.get(m.id) ?? [],
  }));
}

/**
 * Fetch a single module with its lessons. Used by the module page.
 */
export async function getModuleWithLessons(
  moduleId: string,
): Promise<ModuleWithLessons> {
  const { supabase } = await requireAuth();

  const { data: mod, error: modErr } = await supabase
    .from('class_modules')
    .select('id, class_id, title, description, term, display_order, created_at, updated_at')
    .eq('id', moduleId)
    .single();

  if (modErr) throw new Error(`Failed to load module: ${modErr.message}`);

  const { data: lessons, error: lessErr } = await supabase
    .from('module_lessons')
    .select('id, module_id, title, published, published_at, display_order, created_at, updated_at')
    .eq('module_id', moduleId)
    .order('display_order', { ascending: true });

  if (lessErr) throw new Error(`Failed to list lessons: ${lessErr.message}`);

  return {
    ...(mod as ModuleSummary),
    lessons: (lessons ?? []) as LessonSummary[],
  };
}

export async function createModule(
  classId: string,
  title: string,
  term: ModuleTerm,
  description = '',
): Promise<{ moduleId: string }> {
  const { supabase } = await requireAuth();
  const trimmed = title.trim();
  if (!trimmed) throw new Error('Module title cannot be empty.');

  const { data: maxRow } = await supabase
    .from('class_modules')
    .select('display_order')
    .eq('class_id', classId)
    .eq('term', term)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (maxRow?.display_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('class_modules')
    .insert({
      class_id: classId,
      title: trimmed,
      description,
      term,
      display_order: nextOrder,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create module: ${error.message}`);

  const moduleId = data.id as string;

  // Notification fan-out (Session 13). Modules are visible to enrolled
  // students on creation (no published toggle); notify them immediately.
  try {
    const { data: classRow } = await supabase
      .from('classes')
      .select('name')
      .eq('id', classId)
      .maybeSingle();
    const className = (classRow as { name: string } | null)?.name ?? 'your class';
    await notifyModuleCreated({
      moduleId,
      classId,
      className,
      moduleTitle: trimmed,
    });
  } catch (e) {
    console.error('[modules] create notify error:', e);
  }

  revalidatePath(`/teacher/classes/${classId}`);
  revalidatePath(`/student/classes/${classId}`);

  return { moduleId };
}

export async function renameModule(
  moduleId: string,
  title: string,
): Promise<void> {
  const { supabase } = await requireAuth();
  const trimmed = title.trim();
  if (!trimmed) throw new Error('Module title cannot be empty.');

  const { data, error } = await supabase
    .from('class_modules')
    .update({ title: trimmed })
    .eq('id', moduleId)
    .select('class_id')
    .single();

  if (error) throw new Error(`Failed to rename module: ${error.message}`);
  if (data?.class_id) {
    revalidatePath(`/teacher/classes/${data.class_id}`);
    revalidatePath(`/student/classes/${data.class_id}`);
    revalidatePath(`/teacher/classes/${data.class_id}/modules/${moduleId}`);
  }
}

export async function updateModuleDescription(
  moduleId: string,
  description: string,
): Promise<void> {
  const { supabase } = await requireAuth();

  const { data, error } = await supabase
    .from('class_modules')
    .update({ description })
    .eq('id', moduleId)
    .select('class_id')
    .single();

  if (error) throw new Error(`Failed to update description: ${error.message}`);
  if (data?.class_id) {
    revalidatePath(`/teacher/classes/${data.class_id}`);
    revalidatePath(`/student/classes/${data.class_id}`);
    revalidatePath(`/teacher/classes/${data.class_id}/modules/${moduleId}`);
  }
}

/**
 * Move a module to a different term. Inserts at the END of the destination
 * term's list (max display_order + 1).
 */
export async function setModuleTerm(
  moduleId: string,
  term: ModuleTerm,
): Promise<void> {
  const { supabase } = await requireAuth();

  const { data: pre } = await supabase
    .from('class_modules')
    .select('class_id, term')
    .eq('id', moduleId)
    .maybeSingle();

  if (!pre) throw new Error('Module not found.');
  if (pre.term === term) return;

  const { data: maxRow } = await supabase
    .from('class_modules')
    .select('display_order')
    .eq('class_id', pre.class_id)
    .eq('term', term)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (maxRow?.display_order ?? -1) + 1;

  const { error } = await supabase
    .from('class_modules')
    .update({ term, display_order: nextOrder })
    .eq('id', moduleId);

  if (error) throw new Error(`Failed to change term: ${error.message}`);
  revalidatePath(`/teacher/classes/${pre.class_id}`);
  revalidatePath(`/student/classes/${pre.class_id}`);
  revalidatePath(`/teacher/classes/${pre.class_id}/modules/${moduleId}`);
}

export async function deleteModule(moduleId: string): Promise<void> {
  const { supabase } = await requireAuth();

  const { data: pre } = await supabase
    .from('class_modules')
    .select('class_id')
    .eq('id', moduleId)
    .maybeSingle();

  const { error } = await supabase
    .from('class_modules')
    .delete()
    .eq('id', moduleId);

  if (error) throw new Error(`Failed to delete module: ${error.message}`);
  if (pre?.class_id) {
    revalidatePath(`/teacher/classes/${pre.class_id}`);
    revalidatePath(`/student/classes/${pre.class_id}`);
  }
}

export async function reorderModules(
  classId: string,
  term: ModuleTerm,
  moduleIds: string[],
): Promise<void> {
  const { supabase } = await requireAuth();
  const { error } = await supabase.rpc('reorder_modules', {
    p_class_id: classId,
    p_term: term,
    p_module_ids: moduleIds,
  });
  if (error) throw new Error(`Failed to reorder modules: ${error.message}`);
  revalidatePath(`/teacher/classes/${classId}`);
  revalidatePath(`/student/classes/${classId}`);
}

// ---------- Lesson actions ----------

export async function getLesson(lessonId: string): Promise<LessonDetail> {
  const { supabase } = await requireAuth();

  const { data, error } = await supabase
    .from('module_lessons')
    .select(`
      id, module_id, title, body, published, published_at,
      display_order, created_at, updated_at,
      class_modules!inner ( class_id ),
      lesson_attachments ( id, lesson_id, file_path, file_name, file_size, mime_type, uploaded_at )
    `)
    .eq('id', lessonId)
    .single();

  if (error) throw new Error(`Failed to load lesson: ${error.message}`);

  const classId = (data.class_modules as unknown as { class_id: string }).class_id;
  const attachments = ((data.lesson_attachments ?? []) as LessonAttachment[])
    .slice()
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));

  return {
    id: data.id,
    module_id: data.module_id,
    title: data.title,
    body: data.body,
    published: data.published,
    published_at: data.published_at,
    display_order: data.display_order,
    created_at: data.created_at,
    updated_at: data.updated_at,
    class_id: classId,
    attachments,
  };
}

export async function createLesson(
  moduleId: string,
  title: string,
): Promise<{ lessonId: string; classId: string }> {
  const { supabase } = await requireAuth();
  const trimmed = title.trim();
  if (!trimmed) throw new Error('Lesson title cannot be empty.');

  const { data: mod } = await supabase
    .from('class_modules')
    .select('class_id')
    .eq('id', moduleId)
    .single();

  if (!mod) throw new Error('Module not found.');

  const { data: maxRow } = await supabase
    .from('module_lessons')
    .select('display_order')
    .eq('module_id', moduleId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (maxRow?.display_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('module_lessons')
    .insert({
      module_id: moduleId,
      title: trimmed,
      body: '',
      published: false,
      display_order: nextOrder,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create lesson: ${error.message}`);

  revalidatePath(`/teacher/classes/${mod.class_id}`);
  revalidatePath(`/student/classes/${mod.class_id}`);
  revalidatePath(`/teacher/classes/${mod.class_id}/modules/${moduleId}`);

  return { lessonId: data.id as string, classId: mod.class_id as string };
}

export async function updateLesson(
  lessonId: string,
  patch: { title?: string; body?: string },
): Promise<void> {
  const { supabase } = await requireAuth();

  const update: Record<string, string> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) throw new Error('Lesson title cannot be empty.');
    update.title = t;
  }
  if (patch.body !== undefined) {
    update.body = patch.body;
  }
  if (Object.keys(update).length === 0) return;

  const { data, error } = await supabase
    .from('module_lessons')
    .update(update)
    .eq('id', lessonId)
    .select('module_id, class_modules!inner ( class_id )')
    .single();

  if (error) throw new Error(`Failed to update lesson: ${error.message}`);

  const classId = (data?.class_modules as unknown as { class_id: string })?.class_id;
  if (classId) {
    revalidatePath(`/teacher/classes/${classId}`);
    revalidatePath(`/student/classes/${classId}`);
    revalidatePath(`/teacher/classes/${classId}/lessons/${lessonId}`);
    revalidatePath(`/student/classes/${classId}/lessons/${lessonId}`);
  }
}

export async function setLessonPublished(
  lessonId: string,
  published: boolean,
): Promise<void> {
  const { supabase } = await requireAuth();

  const { data, error } = await supabase
    .from('module_lessons')
    .update({ published })
    .eq('id', lessonId)
    .select('title, class_modules!inner ( class_id )')
    .single();

  if (error) throw new Error(`Failed to update publish state: ${error.message}`);

  const row = data as unknown as {
    title: string;
    class_modules: { class_id: string };
  };
  const classId = row.class_modules?.class_id;
  if (classId) {
    revalidatePath(`/teacher/classes/${classId}`);
    revalidatePath(`/student/classes/${classId}`);

    // Notification fan-out (Session 13). Only fire on publish=true. Like
    // setActivityPublished, we don't track the previous state — toggling
    // to true implies it was previously a draft. Re-publishing wouldn't
    // re-notify in practice because the UI doesn't expose that flow.
    if (published) {
      try {
        const { data: classRow } = await supabase
          .from('classes')
          .select('name')
          .eq('id', classId)
          .maybeSingle();
        const className = (classRow as { name: string } | null)?.name ?? 'your class';
        await notifyLessonPublished({
          lessonId,
          moduleId: '',
          classId,
          className,
          lessonTitle: row.title,
        });
      } catch (e) {
        console.error('[modules] lesson publish notify error:', e);
      }
    }
  }
}

export async function deleteLesson(lessonId: string): Promise<void> {
  const { supabase } = await requireAuth();

  const { data: pre } = await supabase
    .from('module_lessons')
    .select(`
      module_id,
      class_modules!inner ( class_id ),
      lesson_attachments ( file_path )
    `)
    .eq('id', lessonId)
    .maybeSingle();

  const classId = (pre?.class_modules as unknown as { class_id: string } | undefined)?.class_id;
  const moduleId = pre?.module_id as string | undefined;
  const paths = ((pre?.lesson_attachments ?? []) as { file_path: string }[]).map((a) => a.file_path);

  if (paths.length > 0) {
    const { error: storErr } = await supabase.storage
      .from('lesson-attachments')
      .remove(paths);
    if (storErr) {
      console.error('Lesson attachment storage cleanup failed:', storErr.message);
    }
  }

  const { error } = await supabase
    .from('module_lessons')
    .delete()
    .eq('id', lessonId);

  if (error) throw new Error(`Failed to delete lesson: ${error.message}`);

  if (classId) {
    revalidatePath(`/teacher/classes/${classId}`);
    revalidatePath(`/student/classes/${classId}`);
    if (moduleId) {
      revalidatePath(`/teacher/classes/${classId}/modules/${moduleId}`);
    }
  }
}

export async function reorderLessons(
  moduleId: string,
  lessonIds: string[],
): Promise<void> {
  const { supabase } = await requireAuth();

  const { error } = await supabase.rpc('reorder_lessons', {
    p_module_id: moduleId,
    p_lesson_ids: lessonIds,
  });
  if (error) throw new Error(`Failed to reorder lessons: ${error.message}`);

  const { data: mod } = await supabase
    .from('class_modules')
    .select('class_id')
    .eq('id', moduleId)
    .maybeSingle();

  if (mod?.class_id) {
    revalidatePath(`/teacher/classes/${mod.class_id}`);
    revalidatePath(`/student/classes/${mod.class_id}`);
    revalidatePath(`/teacher/classes/${mod.class_id}/modules/${moduleId}`);
  }
}

// ---------- Attachment actions ----------

export async function recordAttachment(args: {
  lessonId: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
}): Promise<void> {
  const { supabase, userId } = await requireAuth();

  const { data, error } = await supabase
    .from('lesson_attachments')
    .insert({
      lesson_id: args.lessonId,
      file_path: args.filePath,
      file_name: args.fileName,
      file_size: args.fileSize,
      mime_type: args.mimeType,
      uploaded_by: userId,
    })
    .select('lesson_id, module_lessons!inner ( module_id, class_modules!inner ( class_id ) )')
    .single();

  if (error) throw new Error(`Failed to record attachment: ${error.message}`);

  const classId = (data?.module_lessons as unknown as
    { class_modules: { class_id: string } } | undefined
  )?.class_modules?.class_id;

  if (classId) {
    revalidatePath(`/teacher/classes/${classId}/lessons/${args.lessonId}`);
    revalidatePath(`/student/classes/${classId}/lessons/${args.lessonId}`);
  }
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  const { supabase } = await requireAuth();

  const { data: pre } = await supabase
    .from('lesson_attachments')
    .select(`
      lesson_id, file_path,
      module_lessons!inner ( class_modules!inner ( class_id ) )
    `)
    .eq('id', attachmentId)
    .maybeSingle();

  if (!pre) throw new Error('Attachment not found.');

  const { error: storErr } = await supabase.storage
    .from('lesson-attachments')
    .remove([pre.file_path]);
  if (storErr) {
    console.error('Storage delete failed:', storErr.message);
  }

  const { error } = await supabase
    .from('lesson_attachments')
    .delete()
    .eq('id', attachmentId);

  if (error) throw new Error(`Failed to delete attachment: ${error.message}`);

  const classId = (pre.module_lessons as unknown as
    { class_modules: { class_id: string } }
  )?.class_modules?.class_id;

  if (classId) {
    revalidatePath(`/teacher/classes/${classId}/lessons/${pre.lesson_id}`);
    revalidatePath(`/student/classes/${classId}/lessons/${pre.lesson_id}`);
  }
}

export async function getSignedAttachmentUrl(
  attachmentId: string,
): Promise<string> {
  const { supabase } = await requireAuth();

  const { data: row, error: rowErr } = await supabase
    .from('lesson_attachments')
    .select('file_path')
    .eq('id', attachmentId)
    .single();

  if (rowErr) throw new Error(`Failed to load attachment: ${rowErr.message}`);

  const { data, error } = await supabase.storage
    .from('lesson-attachments')
    .createSignedUrl(row.file_path, 3600);

  if (error) throw new Error(`Failed to sign URL: ${error.message}`);
  return data.signedUrl;
}

export async function getModuleForStudent(
  moduleId: string,
): Promise<ModuleWithLessons> {
  return getModuleWithLessons(moduleId);
}