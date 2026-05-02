-- 1. Create the profile for your teacher account
INSERT INTO public.profiles (id, role, email)
VALUES (
  'c5c425cb-40e1-4906-98d2-636a6b094a91', 
  'teacher', 
  'teachertest@alms.onmicrosoft.com'
)
ON CONFLICT (id) DO UPDATE SET role = 'teacher';

-- 2. Double check the result
SELECT id, email, role FROM public.profiles WHERE id = 'c5c425cb-40e1-4906-98d2-636a6b094a91';