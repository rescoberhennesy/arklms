-- Phase 7: add description to class_modules.
-- Optional teacher-authored summary of what the module covers. Markdown
-- supported (rendered via MarkdownContent on the module page).

ALTER TABLE public.class_modules
  ADD COLUMN description TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.class_modules.description IS
  'Teacher-authored module description, markdown supported.';