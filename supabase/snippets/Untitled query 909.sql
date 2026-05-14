CREATE POLICY "Teachers can create their own classes" 
ON public.classes 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = teacher_id); 
-- Ensure 'teacher_id' matches the column name in your table where you store the creator's ID.