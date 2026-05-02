DO $$ 
DECLARE 
    pol record;
BEGIN 
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public') LOOP
        EXECUTE format('DROP POLICY %I ON public.profiles', pol.policyname);
    END LOOP;
END $$;

-- 1. Enable RLS (just in case it got toggled)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Simple 'Own Profile' policy (No table lookups, just ID comparison)
CREATE POLICY "profiles_self_service" 
ON public.profiles 
FOR SELECT 
TO authenticated 
USING ( auth.uid() = id );

-- 3. Staff policy (Checks the JWT, NOT the table)
CREATE POLICY "profiles_staff_view" 
ON public.profiles 
FOR SELECT 
TO authenticated 
USING ( (auth.jwt() ->> 'role') IN ('admin', 'teacher') );

-- 4. Service Role Bypass (Ensures the server can always read profiles)
CREATE POLICY "service_role_all" 
ON public.profiles 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);