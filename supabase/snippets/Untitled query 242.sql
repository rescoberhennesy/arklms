-- Explicitly allow public reading of all objects in the class-covers bucket
DROP POLICY IF EXISTS "Public Access" ON storage.objects;

CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'class-covers' );