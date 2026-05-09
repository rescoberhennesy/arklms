-- supabase/migrations/20260509020000_activity_submissions.sql
--
-- Phase 8a Layer A — Migration 2 of 5
-- Activity submissions + attachments + private storage bucket.
--
-- Path layout for submission-attachments bucket:
--   <class_id>/<activity_id>/<student_id>/<timestamp>-<sanitized_filename>
-- foldername[1] = class_id, foldername[2] = activity_id, foldername[3] = student_id
--
-- Note: the activity_submissions UPDATE policy lives in Migration 3
-- (activity_grades), not here. The UPDATE rule needs to reference whether
-- a grade exists, and Postgres requires the referenced table to exist at
-- CREATE POLICY time. So Migration 3 creates activity_grades AND adds the
-- submission UPDATE policy. Until then, no one can UPDATE submissions —
-- which is fine because no submissions exist yet either.

-- activity_submissions ------------------------------------------------------

CREATE TABLE activity_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id     uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  text_body       text,
  is_late         boolean NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT activity_submissions_unique_per_student
    UNIQUE (activity_id, student_id)
);

CREATE INDEX activity_submissions_activity_idx
  ON activity_submissions (activity_id);

CREATE INDEX activity_submissions_student_idx
  ON activity_submissions (student_id);

CREATE TRIGGER tg_activity_submissions_set_updated_at
  BEFORE UPDATE ON activity_submissions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- submission_attachments ----------------------------------------------------

CREATE TABLE submission_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   uuid NOT NULL REFERENCES activity_submissions(id) ON DELETE CASCADE,
  file_path       text NOT NULL,
  file_name       text NOT NULL,
  file_size       bigint NOT NULL CHECK (file_size > 0),
  mime_type       text NOT NULL,
  uploaded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX submission_attachments_submission_idx
  ON submission_attachments (submission_id);

-- RLS: activity_submissions -------------------------------------------------

ALTER TABLE activity_submissions ENABLE ROW LEVEL SECURITY;

-- SELECT: admin always
CREATE POLICY activity_submissions_admin_select ON activity_submissions
  FOR SELECT
  USING (get_user_role(auth.uid()) = 'admin');

-- SELECT: teacher of the activity's class
CREATE POLICY activity_submissions_teacher_select ON activity_submissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM activities a
      WHERE a.id = activity_submissions.activity_id
        AND is_class_teacher(a.class_id, auth.uid())
    )
  );

-- SELECT: student sees own submissions
CREATE POLICY activity_submissions_student_select ON activity_submissions
  FOR SELECT
  USING (student_id = auth.uid());

-- INSERT: enrolled student, only within submission window
CREATE POLICY activity_submissions_student_insert ON activity_submissions
  FOR INSERT
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM activities a
      JOIN class_enrollments e ON e.class_id = a.class_id
      WHERE a.id = activity_submissions.activity_id
        AND e.student_id = auth.uid()
        AND a.published = true
        AND a.start_at <= now()
        AND (now() <= a.due_at OR a.allow_late = true)
    )
  );

-- (UPDATE policy added in Migration 3, see file header note above.)

-- DELETE: teacher of the class only (cleanup, rare)
CREATE POLICY activity_submissions_teacher_delete ON activity_submissions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM activities a
      WHERE a.id = activity_submissions.activity_id
        AND is_class_teacher(a.class_id, auth.uid())
    )
  );

-- RLS: submission_attachments -----------------------------------------------

ALTER TABLE submission_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY submission_attachments_admin_select ON submission_attachments
  FOR SELECT
  USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY submission_attachments_teacher_select ON submission_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM activity_submissions s
      JOIN activities a ON a.id = s.activity_id
      WHERE s.id = submission_attachments.submission_id
        AND is_class_teacher(a.class_id, auth.uid())
    )
  );

CREATE POLICY submission_attachments_student_select ON submission_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM activity_submissions s
      WHERE s.id = submission_attachments.submission_id
        AND s.student_id = auth.uid()
    )
  );

-- INSERT: student inserting attachment for their own submission
CREATE POLICY submission_attachments_student_insert ON submission_attachments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM activity_submissions s
      WHERE s.id = submission_attachments.submission_id
        AND s.student_id = auth.uid()
    )
  );

-- DELETE: student can delete own attachment (resubmit cleanup)
CREATE POLICY submission_attachments_student_delete ON submission_attachments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM activity_submissions s
      WHERE s.id = submission_attachments.submission_id
        AND s.student_id = auth.uid()
    )
  );

-- DELETE: teacher of class (rare cleanup)
CREATE POLICY submission_attachments_teacher_delete ON submission_attachments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM activity_submissions s
      JOIN activities a ON a.id = s.activity_id
      WHERE s.id = submission_attachments.submission_id
        AND is_class_teacher(a.class_id, auth.uid())
    )
  );

-- Storage bucket ------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'submission-attachments',
  'submission-attachments',
  false,
  26214400,
  ARRAY[
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
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: submission-attachments bucket --------------------------------
-- Path layout: <class_id>/<activity_id>/<student_id>/<timestamp>-<filename>

CREATE POLICY "submission_attachments_student_insert_object"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'submission-attachments'
    AND (storage.foldername(name))[3]::uuid = auth.uid()
    AND EXISTS (
      SELECT 1 FROM class_enrollments e
      WHERE e.class_id = (storage.foldername(name))[1]::uuid
        AND e.student_id = auth.uid()
    )
  );

CREATE POLICY "submission_attachments_student_select_object"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'submission-attachments'
    AND (storage.foldername(name))[3]::uuid = auth.uid()
  );

CREATE POLICY "submission_attachments_student_delete_object"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'submission-attachments'
    AND (storage.foldername(name))[3]::uuid = auth.uid()
  );

CREATE POLICY "submission_attachments_teacher_select_object"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'submission-attachments'
    AND is_class_teacher((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "submission_attachments_teacher_delete_object"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'submission-attachments'
    AND is_class_teacher((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "submission_attachments_admin_all_object"
  ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'submission-attachments'
    AND get_user_role(auth.uid()) = 'admin'
  )
  WITH CHECK (
    bucket_id = 'submission-attachments'
    AND get_user_role(auth.uid()) = 'admin'
  );

-- Comments ------------------------------------------------------------------

COMMENT ON TABLE activity_submissions IS 'Student submissions for activities. One row per (activity, student), mutated in place on resubmit.';
COMMENT ON TABLE submission_attachments IS 'File attachments for activity submissions. Files stored in submission-attachments bucket.';
COMMENT ON COLUMN activity_submissions.is_late IS 'Set at submission time by comparing now() to activities.due_at. Not recomputed on read.';
