-- Avatar photo storage for user profiles.
--
-- Creates the avatars bucket and RLS so:
--   - any client (incl. signed-out) can read avatars via public URL
--   - a user can only insert/update/delete their OWN avatar
--
-- Path convention: avatars/<user_id>/avatar.<ext>
-- The first folder segment is the user_id; RLS extracts it and checks
-- it equals auth.uid(). Mirrors the class-covers storage pattern.

-- ---------- bucket ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,                                            -- public read via URL
  2097152,                                         -- 2 MB (avatars are small)
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------- RLS policies on storage.objects ----------

-- SELECT: anyone (auth or anon) can read avatars.
DROP POLICY IF EXISTS "avatars_select" ON storage.objects;
CREATE POLICY "avatars_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- INSERT: only into your own folder (first segment = your uid).
DROP POLICY IF EXISTS "avatars_insert_self" ON storage.objects;
CREATE POLICY "avatars_insert_self"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1]::uuid = auth.uid()
);

-- UPDATE: same predicate on both existing and new row.
DROP POLICY IF EXISTS "avatars_update_self" ON storage.objects;
CREATE POLICY "avatars_update_self"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1]::uuid = auth.uid()
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1]::uuid = auth.uid()
);

-- DELETE: same predicate.
DROP POLICY IF EXISTS "avatars_delete_self" ON storage.objects;
CREATE POLICY "avatars_delete_self"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1]::uuid = auth.uid()
);