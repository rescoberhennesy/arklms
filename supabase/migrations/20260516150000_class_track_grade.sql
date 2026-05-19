-- Adds SHS track and grade level to classes.
--
-- track:       ABM | HUMSS | H.E | ICT     (the four SHS strands in use)
-- grade_level: Grade 11 | Grade 12
--
-- Both are nullable: classes created before this migration have no
-- track/grade, and the UI shows them as "—". New classes created via
-- the modal will always supply both.

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS track TEXT
    CHECK (track IS NULL OR track IN ('ABM', 'HUMSS', 'H.E', 'ICT'));

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS grade_level TEXT
    CHECK (grade_level IS NULL OR grade_level IN ('Grade 11', 'Grade 12'));

-- Index helps the admin Sections page group/filter quickly.
CREATE INDEX IF NOT EXISTS classes_section_grade_track_idx
  ON public.classes (section, grade_level, track);

COMMENT ON COLUMN public.classes.track IS
  'SHS strand: ABM, HUMSS, H.E, or ICT. Nullable for legacy classes.';
COMMENT ON COLUMN public.classes.grade_level IS
  'SHS grade level: Grade 11 or Grade 12. Nullable for legacy classes.';