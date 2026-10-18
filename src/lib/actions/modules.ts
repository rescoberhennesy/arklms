'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ModuleTerm } from '@/lib/types/modules';
import { notifyModuleCreated } from '@/lib/actions/notifications';
import { notifyLessonPublished } from '@/lib/actions/notifications';

import { listMyClasses } from '@/lib/actions/classes';
import type { TeacherClassListItem } from '@/types/class';

// ---------- Types ----------

export type ModuleSummary = {
  id: string;
  class_id: string;
  title: string;
  description: string;
   term: ModuleTerm;
  display_order: number;
  is_hidden: boolean;
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
    .select('id, class_id, title, description, term, display_order, is_hidden, created_at, updated_at')
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
    .select('id, class_id, title, description, term, display_order, is_hidden, created_at, updated_at')
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

export async function getAttachmentDownloadData(
  attachmentId: string,
): Promise<{ dataUrl: string; fileName: string; mimeType: string | null }> {
  const { supabase } = await requireAuth();

  const { data: row, error: rowErr } = await supabase
    .from('lesson_attachments')
    .select('file_path, file_name, mime_type')
    .eq('id', attachmentId)
    .single();

  if (rowErr) throw new Error(`Failed to load attachment: ${rowErr.message}`);

  const { data, error } = await supabase.storage
    .from('lesson-attachments')
    .download(row.file_path);

  if (error) throw new Error(`Failed to download attachment: ${error.message}`);

  // Convert Blob to base64 data URL so the browser can render/save it
  // without needing a separate signed-URL round-trip.
  const arrayBuffer = await data.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const mimeType = row.mime_type ?? 'application/octet-stream';
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return {
    dataUrl,
    fileName: row.file_name,
    mimeType: row.mime_type,
  };
}

export async function getModuleForStudent(
  moduleId: string,
): Promise<ModuleWithLessons> {
  return getModuleWithLessons(moduleId);
}

/**
 * Same filter shape as the Grades and Activities shortcuts — three shortcut
 * pages now share this dialect, so the filter bars stay interchangeable.
 */
export interface MyClassModulesFilters {
  classId?: string | null;
  section?: string | null;
  track?: string | null;
  gradeLevel?: string | null;
}

export interface AggregatedClassModules {
  class: TeacherClassListItem;
  modules: ModuleWithLessons[];
}

/**
 * For the signed-in teacher: load every active class they own that matches
 * the supplied filters, then for each class fetch its modules-with-lessons.
 *
 * Per-class fan-out is intentional (modules are per-class — different terms,
 * different ordering, different titles — and cannot be safely merged into a
 * single list). listModulesWithLessons runs 2 queries per class, so N classes
 * = 2N round trips. Cheap compared to the Activities aggregated page.
 *
 * Archived classes excluded by design — aggregated view is "what am I
 * working on now". Add ?archived=true later if needed.
 */
export async function getMyClassModules(
  filters?: MyClassModulesFilters,
): Promise<AggregatedClassModules[]> {
  const classesRes = await listMyClasses();
  if (!classesRes.ok) {
    throw new Error(classesRes.error);
  }

  const active = classesRes.data.filter((c) => !c.is_archived);

  const matched = active.filter((c) => {
    if (filters?.classId && c.id !== filters.classId) return false;
    if (filters?.section && c.section !== filters.section) return false;
    if (filters?.track && c.track !== filters.track) return false;
    if (filters?.gradeLevel && c.grade_level !== filters.gradeLevel) {
      return false;
    }
    return true;
  });

  if (matched.length === 0) return [];

  const moduleLists = await Promise.all(
    matched.map((c) => listModulesWithLessons(c.id)),
  );

  return matched.map((c, i) => ({
    class: c,
    modules: moduleLists[i],
  }));

}

/**
 * Short-lived signed link to an attachment, loaded by the browser straight
 * from Supabase Storage. Works for large files (no 2 MB data-URL limit) and
 * never passes the file through our server. Storage policies still decide
 * who may get a link: teachers of the class, and students only for
 * published lessons in modules they can see.
 */
export async function getAttachmentSignedUrl(
  attachmentId: string,
  options: { download?: boolean } = {},
): Promise<{ url: string; fileName: string; mimeType: string | null }> {
  const { supabase } = await requireAuth();

  const { data: row, error: rowErr } = await supabase
    .from('lesson_attachments')
    .select('file_path, file_name, mime_type')
    .eq('id', attachmentId)
    .single();

  if (rowErr) throw new Error(`Failed to load attachment: ${rowErr.message}`);

  const { data, error } = await supabase.storage
    .from('lesson-attachments')
    .createSignedUrl(
      row.file_path,
      60 * 10, // valid for 10 minutes
      options.download ? { download: row.file_name } : undefined,
    );

  if (error || !data) {
    throw new Error(`Failed to open attachment: ${error?.message ?? 'unknown error'}`);
  }

  return { url: data.signedUrl, fileName: row.file_name, mimeType: row.mime_type };
}

// ===========================================================================
// Copy modules + lessons from another class
// ===========================================================================

export type CopyModulesSelection = {
  moduleId: string;
  /** Lessons to copy from this module (empty = copy the module only). */
  lessonIds: string[];
};

export type CopyModulesResult = {
  modules: number;
  lessons: number;
  files: number;
  decks: number;
};

export async function copyModulesFromClass(input: {
  targetClassId: string;
  selections: CopyModulesSelection[];
  /** 'same' keeps each module's original term. */
  targetTerm: ModuleTerm | 'same';
}): Promise<CopyModulesResult> {
  const { supabase } = await requireAuth();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  if (input.selections.length === 0) throw new Error('Select at least one module.');

  const result: CopyModulesResult = { modules: 0, lessons: 0, files: 0, decks: 0 };
  const createdModuleIds: string[] = [];
  const copiedPaths: string[] = [];
  const nextOrderByTerm = new Map<string, number>();

  async function nextModuleOrder(term: ModuleTerm): Promise<number> {
    if (!nextOrderByTerm.has(term)) {
      const { data } = await supabase
        .from('class_modules')
        .select('display_order')
        .eq('class_id', input.targetClassId)
        .eq('term', term)
        .order('display_order', { ascending: false })
        .limit(1);
      const top = (data?.[0] as { display_order: number } | undefined)?.display_order;
      nextOrderByTerm.set(term, top === undefined ? 0 : top + 1);
    }
    const n = nextOrderByTerm.get(term)!;
    nextOrderByTerm.set(term, n + 1);
    return n;
  }

  try {
    for (const sel of input.selections) {
      // --- Source module (RLS: only classes this teacher can read) ---
      const { data: srcMod, error: modErr } = await supabase
        .from('class_modules')
        .select('id, class_id, title, description, term')
        .eq('id', sel.moduleId)
        .single();
      if (modErr || !srcMod) throw new Error('A selected module could not be found.');
      const mod = srcMod as {
        id: string;
        class_id: string;
        title: string;
        description: string | null;
        term: ModuleTerm;
      };

      const term = input.targetTerm === 'same' ? mod.term : input.targetTerm;
      const sameClass = mod.class_id === input.targetClassId;

      const { data: newMod, error: insModErr } = await supabase
        .from('class_modules')
        .insert({
          class_id: input.targetClassId,
          title: sameClass ? `${mod.title} (copy)` : mod.title,
          description: mod.description ?? '',
          term,
          display_order: await nextModuleOrder(term),
          is_hidden: true, // teacher reviews, then shows it
        })
        .select('id')
        .single();
      if (insModErr || !newMod) {
        throw new Error(`Failed to copy module "${mod.title}": ${insModErr?.message ?? 'unknown'}`);
      }
      const newModuleId = (newMod as { id: string }).id;
      createdModuleIds.push(newModuleId);
      result.modules++;

      if (sel.lessonIds.length === 0) continue;

      // --- Lessons (keep their original order) ---
      const { data: srcLessons, error: lessErr } = await supabase
        .from('module_lessons')
        .select('id, title, body, display_order')
        .eq('module_id', mod.id)
        .in('id', sel.lessonIds)
        .order('display_order', { ascending: true });
      if (lessErr) throw new Error(`Failed to load lessons: ${lessErr.message}`);

      const lessons = (srcLessons ?? []) as {
        id: string;
        title: string;
        body: string | null;
        display_order: number;
      }[];

      for (let i = 0; i < lessons.length; i++) {
        const l = lessons[i];
        const { data: newLesson, error: insLessErr } = await supabase
          .from('module_lessons')
          .insert({
            module_id: newModuleId,
            title: l.title,
            body: l.body ?? '',
            display_order: i,
            published: false, // no notifications until the teacher publishes
          })
          .select('id')
          .single();
        if (insLessErr || !newLesson) {
          throw new Error(`Failed to copy lesson "${l.title}": ${insLessErr?.message ?? 'unknown'}`);
        }
        const newLessonId = (newLesson as { id: string }).id;
        result.lessons++;

        // --- Attachments: duplicate the files under the new class folder ---
        const { data: atts, error: attErr } = await supabase
          .from('lesson_attachments')
          .select('file_path, file_name, file_size, mime_type')
          .eq('lesson_id', l.id);
        if (attErr) throw new Error(`Failed to load attachments: ${attErr.message}`);

        for (const att of (atts ?? []) as {
          file_path: string;
          file_name: string;
          file_size: number;
          mime_type: string | null;
        }[]) {
          const safeName = att.file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
          // Path rule: <class_id>/<module_id>/<lesson_id>/<filename>
          const destPath = `${input.targetClassId}/${newModuleId}/${newLessonId}/${Date.now()}-${safeName}`;

          const { error: copyErr } = await supabase.storage
            .from('lesson-attachments')
            .copy(att.file_path, destPath);
          if (copyErr) throw new Error(`Failed to copy file "${att.file_name}": ${copyErr.message}`);
          copiedPaths.push(destPath);

          const { error: attInsErr } = await supabase.from('lesson_attachments').insert({
            lesson_id: newLessonId,
            file_path: destPath,
            file_name: att.file_name,
            file_size: att.file_size,
            mime_type: att.mime_type,
          });
          if (attInsErr) {
            throw new Error(`Failed to save file "${att.file_name}": ${attInsErr.message}`);
          }
          result.files++;
        }

        // --- Flashcard decks (as drafts) ---
        const { data: decks, error: deckErr } = await supabase
          .from('flashcard_decks')
          .select('id, title')
          .eq('lesson_id', l.id);
        if (deckErr) throw new Error(`Failed to load flashcards: ${deckErr.message}`);

        for (const deck of (decks ?? []) as { id: string; title: string }[]) {
          const { data: newDeck, error: insDeckErr } = await supabase
            .from('flashcard_decks')
            .insert({
              lesson_id: newLessonId,
              title: deck.title,
              published: false,
              created_by: user.id,
            })
            .select('id')
            .single();
          if (insDeckErr || !newDeck) {
            throw new Error(`Failed to copy deck "${deck.title}": ${insDeckErr?.message ?? 'unknown'}`);
          }

          const { data: cards, error: cardErr } = await supabase
            .from('flashcards')
            .select('front, back, display_order')
            .eq('deck_id', deck.id)
            .order('display_order', { ascending: true });
          if (cardErr) throw new Error(`Failed to load cards: ${cardErr.message}`);

          const cardRows = ((cards ?? []) as { front: string; back: string; display_order: number }[]).map(
            (c) => ({
              deck_id: (newDeck as { id: string }).id,
              front: c.front,
              back: c.back,
              display_order: c.display_order,
            }),
          );
          if (cardRows.length > 0) {
            const { error: insCardsErr } = await supabase.from('flashcards').insert(cardRows);
            if (insCardsErr) throw new Error(`Failed to copy cards: ${insCardsErr.message}`);
          }
          result.decks++;
        }
      }
    }
  } catch (err) {
    // Roll back: deleting modules cascades to lessons, attachments and decks
    if (createdModuleIds.length > 0) {
      await supabase.from('class_modules').delete().in('id', createdModuleIds);
    }
    if (copiedPaths.length > 0) {
      await supabase.storage.from('lesson-attachments').remove(copiedPaths);
    }
    throw err;
  }

  revalidatePath(`/teacher/classes/${input.targetClassId}`);
  return result;
}