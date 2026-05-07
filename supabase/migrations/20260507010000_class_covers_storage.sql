-- Phase 5a #1 — cover photo storage
--
-- Creates the class-covers bucket and RLS so:
--   - any client (incl. signed-out) can read covers via public URL
--   - only the teacher of a class can insert/update/delete that class's cover
--
-- Path convention: class-covers/<class_id>/cover.<ext>
-- The first folder segment is the class_id; RLS extracts it and checks
-- is_class_teacher(<class_id>, auth.uid()).

-- ---------- bucket ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'class-covers',
  'class-covers',
  true,                                            -- public read via URL
  5242880,                                         -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------- RLS policies on storage.objects ----------
-- (RLS is already enabled on storage.objects by default in Supabase;
--  we just add policies scoped to bucket_id = 'class-covers'.)

-- SELECT: anyone (auth or anon) can read class-covers objects.
DROP POLICY IF EXISTS "class_covers_select" ON storage.objects;
CREATE POLICY "class_covers_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'class-covers');

-- INSERT: only the teacher of the class whose id is the first folder segment.
-- We cast the segment to uuid; if the path doesn't have a uuid-shaped first
-- segment, the cast errors and the row is rejected -- which is what we want.
DROP POLICY IF EXISTS "class_covers_insert_teacher" ON storage.objects;
CREATE POLICY "class_covers_insert_teacher"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'class-covers'
  AND public.is_class_teacher(
    (storage.foldername(name))[1]::uuid,
    auth.uid()
  )
);

-- UPDATE: same predicate, both USING (existing row) and WITH CHECK (new row).
DROP POLICY IF EXISTS "class_covers_update_teacher" ON storage.objects;
CREATE POLICY "class_covers_update_teacher"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'class-covers'
  AND public.is_class_teacher(
    (storage.foldername(name))[1]::uuid,
    auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'class-covers'
  AND public.is_class_teacher(
    (storage.foldername(name))[1]::uuid,
    auth.uid()
  )
);

-- DELETE: same predicate.
DROP POLICY IF EXISTS "class_covers_delete_teacher" ON storage.objects;
CREATE POLICY "class_covers_delete_teacher"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'class-covers'
  AND public.is_class_teacher(
    (storage.foldername(name))[1]::uuid,
    auth.uid()
  )
);
