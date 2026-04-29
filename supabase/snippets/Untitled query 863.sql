-- Create the admin auth user (replace email/password)
-- Then in SQL editor, after the trigger creates the profile:
update public.profiles
set role = 'admin', full_name = 'System Administrator'
where email = 'admin@arkadian.local';