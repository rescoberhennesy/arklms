-- Phase 7 Layer A: lesson_attachments + private storage bucket.
-- Path convention: <class_id>/<module_id>/<lesson_id>/<filename>
-- Bucket is private (not public-read like class-covers) because lesson
-- materials are gradeable course content. Student downloads go through
-- signed URLs generated server-side.

CREATE TABLE public.lesson_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.module_lessons(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  mime_type TEXT,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX lesson_attachments_lesson_idx
  ON public.lesson_attachments (lesson_id, uploaded_at DESC);

-- RLS on the table itself.
-- SELECT: same gate as module_lessons SELECT policy
-- INSERT/UPDATE/DELETE: teacher of class only
ALTER TABLE public.lesson_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY lesson_attachments_select ON public.lesson_attachments
  FOR SELECT
  TO authenticated
  USING (
    get_user_role(auth.uid()) = 'admin'::user_role
    OR EXISTS (
      SELECT 1
      FROM public.module_lessons l
      JOIN public.class_modules m ON m.id = l.module_id
      WHERE l.id = lesson_attachments.lesson_id
        AND is_class_teacher(m.class_id, auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.module_lessons l
      JOIN public.class_modules m ON m.id = l.module_id
      JOIN public.class_enrollments e ON e.class_id = m.class_id
      WHERE l.id = lesson_attachments.lesson_id
        AND l.published = true
        AND e.student_id = auth.uid()
    )
  );

CREATE POLICY lesson_attachments_insert ON public.lesson_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.module_lessons l
      JOIN public.class_modules m ON m.id = l.module_id
      WHERE l.id = lesson_attachments.lesson_id
        AND is_class_teacher(m.class_id, auth.uid())
    )
  );

CREATE POLICY lesson_attachments_delete ON public.lesson_attachments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.module_lessons l
      JOIN public.class_modules m ON m.id = l.module_id
      WHERE l.id = lesson_attachments.lesson_id
        AND is_class_teacher(m.class_id, auth.uid())
    )
  );

-- Storage bucket: private, 25MB cap, broad allowlist for course materials.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lesson-attachments',
  'lesson-attachments',
  false,
  26214400,  -- 25 MB
  ARRAY[
    -- documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'text/markdown',
    -- images
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    -- audio / video
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    -- archives
    'application/zip',
    'application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS on storage.objects for the lesson-attachments bucket.
-- Path: <class_id>/<module_id>/<lesson_id>/<filename>
-- foldername(name) returns text[] starting at index 1.
-- We need element 3 (lesson_id) and element 1 (class_id).

-- Helper: a storage object's class_id from its path.
-- (Inline rather than a function so the RLS planner can use it.)

-- INSERT: teacher of the class only (path segment 1 = class_id)
CREATE POLICY lesson_attachments_storage_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'lesson-attachments'
    AND public.is_class_teacher(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  );

-- UPDATE: teacher only (covers any metadata change; rare in practice)
CREATE POLICY lesson_attachments_storage_update ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'lesson-attachments'
    AND public.is_class_teacher(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'lesson-attachments'
    AND public.is_class_teacher(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  );

-- DELETE: teacher only
CREATE POLICY lesson_attachments_storage_delete ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'lesson-attachments'
    AND public.is_class_teacher(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  );

-- SELECT: teacher OR (enrolled student AND lesson is published).
-- Path segment 3 is lesson_id, used to look up published flag.
CREATE POLICY lesson_attachments_storage_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'lesson-attachments'
    AND (
      public.is_class_teacher(
        ((storage.foldername(name))[1])::uuid,
        auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.module_lessons l
        JOIN public.class_modules m ON m.id = l.module_id
        JOIN public.class_enrollments e ON e.class_id = m.class_id
        WHERE l.id = ((storage.foldername(name))[3])::uuid
          AND l.published = true
          AND e.student_id = auth.uid()
      )
    )
  );

COMMENT ON TABLE public.lesson_attachments IS
  'Files attached to lessons. Storage in lesson-attachments bucket (private). Student access gated by published flag.';