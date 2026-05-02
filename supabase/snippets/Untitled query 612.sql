SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.classes'::regclass
  AND conname = 'classes_semester_check';