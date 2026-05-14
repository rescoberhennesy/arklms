-- This makes sure the bucket is public and allows anyone to read the images
update storage.buckets 
set public = true 
where id = 'class-covers';

-- This is the "Master Key" policy to allow public viewing
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects FOR SELECT TO public USING (bucket_id = 'class-covers');