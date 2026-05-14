-- This policy allows anyone to actually see the images in that bucket
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
TO public 
USING (bucket_id = 'class-covers');