-- 1. Remove all existing policies on 'classes' to prevent conflicts
DROP POLICY IF EXISTS "classes_admin_insert" ON public.classes;
DROP POLICY IF EXISTS "classes_insert_teacher" ON public.classes;
DROP POLICY IF EXISTS "classes_admin_all" ON public.classes;
-- Add any other names you saw in your terminal output (like 'classes_admin_select', etc.)
DROP POLICY IF EXISTS "classes_admin_select" ON public.classes;
DROP POLICY IF EXISTS "classes_admin_update" ON public.classes;
DROP POLICY IF EXISTS "classes_admin_delete" ON public.classes;

-- 2. Enable RLS (just in case)
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- 3. Create the SINGLE robust policy for INSERT
CREATE POLICY "unified_insert_classes"
ON public.classes FOR INSERT
TO authenticated
WITH CHECK (
  -- Either the user is an admin
  (public.get_user_role(auth.uid()) = 'admin')
  OR 
  -- Or they are a teacher AND they are inserting their own ID
  (
    public.get_user_role(auth.uid()) = 'teacher' 
    AND 
    auth.uid() = teacher_id
  )
);

-- 4. Create a simple SELECT policy so you can see your new class
CREATE POLICY "unified_select_classes"
ON public.classes FOR SELECT
TO authenticated
USING (
  (public.get_user_role(auth.uid()) = 'admin')
  OR 
  (teacher_id = auth.uid())
  -- Add enrollment check here later if needed
);

-- 5. Reload schema to be safe
NOTIFY pgrst, 'reload schema';