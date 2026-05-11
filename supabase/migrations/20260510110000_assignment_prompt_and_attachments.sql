-- Phase 8b C8: split assignment description into instructions + prompt,
-- and add activity_attachments table for teacher-uploaded reference files
-- (e.g. PDF worksheets attached to assignment prompts).

-- ============================================================================
-- 1. Description split: rename description → instructions, add prompt column.
-- ============================================================================
-- Existing data currently lives in `description`. We rename that column to
-- `instructions` (semantically "intro / context") and add a new `prompt`
-- column for "what to answer". Existing assignments keep all current text
-- in instructions; teachers can move the question portion to `prompt`
-- afterward through the UI.

ALTER TABLE activities RENAME COLUMN description TO instructions;
ALTER TABLE activities ADD COLUMN prompt text NOT NULL DEFAULT '';

-- ============================================================================
-- 2. activity_attachments table
-- ============================================================================
-- Mirrors lesson_attachments. Per Session 10 design: scoped to assignment
-- activities only via CHECK on activity_kind in the FK constraint? No —
-- a CHECK can't reference another row, and a trigger is heavier than
-- needed. We rely on the action layer to refuse uploads for non-assignment
-- activities. RLS still enforces ownership.

CREATE TABLE activity_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size > 0),
  mime_type text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activity_attachments_activity_id_idx
  ON activity_attachments(activity_id);

-- ============================================================================
-- 3. RLS for activity_attachments
-- ============================================================================
ALTER TABLE activity_attachments ENABLE ROW LEVEL SECURITY;

-- Teacher of the class: full access
CREATE POLICY activity_attachments_teacher_all
  ON activity_attachments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM activities a
      WHERE a.id = activity_attachments.activity_id
        AND public.is_class_teacher(a.class_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM activities a
      WHERE a.id = activity_attachments.activity_id
        AND public.is_class_teacher(a.class_id, auth.uid())
    )
  );

-- Enrolled student: SELECT only, and only for published activities
CREATE POLICY activity_attachments_student_select
  ON activity_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM activities a
      WHERE a.id = activity_attachments.activity_id
        AND a.published = true
        AND public.is_student_in_class(a.class_id, auth.uid())
    )
  );

-- Admin: full access (consistent with other admin policies)
CREATE POLICY activity_attachments_admin_all
  ON activity_attachments
  FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- ============================================================================
-- 4. Storage bucket: activity-attachments
-- ============================================================================
-- Path convention: <class_id>/<activity_id>/<timestamp>-<sanitized_filename>
-- Mirrors lesson-attachments path convention.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'activity-attachments',
  'activity-attachments',
  false,                  -- private; access through signed URLs only
  26214400,               -- 25 MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'text/plain',
    'text/markdown',
    'text/csv',
    'audio/mpeg',
    'audio/wav',
    'video/mp4',
    'video/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 5. Storage RLS for activity-attachments bucket
-- ============================================================================
-- Path layout: <class_id>/<activity_id>/<filename>
-- so split_part(name, '/', 1) = class_id and split_part(name, '/', 2) = activity_id

-- Teacher of the class: full access
CREATE POLICY activity_attachments_storage_teacher
  ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'activity-attachments'
    AND public.is_class_teacher(
      split_part(name, '/', 1)::uuid,
      auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'activity-attachments'
    AND public.is_class_teacher(
      split_part(name, '/', 1)::uuid,
      auth.uid()
    )
  );

-- Enrolled student: SELECT only on objects whose activity is published
-- (RLS check piggybacks on activity_attachments table RLS via a join).
CREATE POLICY activity_attachments_storage_student_select
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'activity-attachments'
    AND EXISTS (
      SELECT 1 FROM activity_attachments aa
      JOIN activities a ON a.id = aa.activity_id
      WHERE aa.file_path = storage.objects.name
        AND a.published = true
        AND public.is_student_in_class(a.class_id, auth.uid())
    )
  );

-- Admin: full access
CREATE POLICY activity_attachments_storage_admin
  ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'activity-attachments'
    AND public.get_user_role(auth.uid()) = 'admin'
  )
  WITH CHECK (
    bucket_id = 'activity-attachments'
    AND public.get_user_role(auth.uid()) = 'admin'
  );