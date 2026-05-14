-- 1. Allow Teachers to INSERT classes
CREATE POLICY "Teachers can create classes"
ON public.classes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = teacher_id);

-- 2. Allow Teachers to SELECT their own classes (Required for .select() to work)
CREATE POLICY "Teachers can view their own classes"
ON public.classes
FOR SELECT
TO authenticated
USING (auth.uid() = teacher_id);