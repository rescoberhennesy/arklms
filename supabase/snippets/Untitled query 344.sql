-- Does the function exist with the right signature?
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'is_class_teacher';

-- What's the actual path of the failing attachment?
SELECT id, name, lesson_id
FROM lesson_attachments
WHERE id = 'cbf0d621-4248-4428-94f9-79819540c8a0';

-- Is the student actually enrolled?
SELECT e.class_id, e.student_id, e.created_at
FROM class_enrollments e
WHERE e.class_id = '99c12cfa-585e-404f-87ee-c3ae22991065'
  AND e.student_id = auth.uid();
-- (the last one needs to run as the student — easier: just replace auth.uid() with the student's user id)

-- Is the lesson actually published?
SELECT id, title, published
FROM module_lessons
WHERE id = '9091bc48-964b-4f50-91e1-ecd996f1fe7d';

-- And the path stored in storage.objects?
SELECT name, bucket_id
FROM storage.objects
WHERE bucket_id = 'lesson-attachments'
  AND name LIKE '%9091bc48-964b-4f50-91e1-ecd996f1fe7d%';