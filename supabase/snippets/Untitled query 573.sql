-- This allows anyone to view images in the 'class-covers' bucket
CREATE POLICY "Give public access to class-covers"
ON storage.objects FOR SELECT
USING (bucket_id = 'class-covers');