-- supabase/migrations/20260515120000_flashcards.sql
--
-- Flashcards: AI-generated study decks attached to lessons.
--
-- Design (Session C, 2026-05-15):
--   - One deck per lesson (enforced by app logic, not schema — keeps the door
--     open for multi-deck per lesson later if pedagogically warranted).
--   - Cards have markdown front + back. AI generates the initial set; teacher
--     reviews/edits/reorders/adds/deletes before flipping `published = true`.
--   - Students see only `published = true` decks for lessons they can already
--     read. RLS inherits the lesson's visibility chain.
--   - Audit trail: every AI-generated deck links to ai_generations.id so we
--     can answer "where did this deck come from?" during defense.
--
-- This file:
--   1. Adds 'flashcards' to the ai_generations.feature CHECK constraint
--   2. Creates flashcard_decks + flashcards tables
--   3. Indexes for ordered fetch
--   4. RLS policies (teacher full access; student SELECT for published)
--   5. updated_at triggers
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Add 'flashcards' to ai_generations.feature CHECK constraint
-- -------------------------------------------------------------------------
ALTER TABLE public.ai_generations
  DROP CONSTRAINT IF EXISTS ai_generations_feature_check;

ALTER TABLE public.ai_generations
  ADD CONSTRAINT ai_generations_feature_check
  CHECK (feature IN (
    'quiz', 'reviewer', 'activity_suggest', 'rubric',
    'analytics_insight', 'feedback', 'announcement',
    'flashcards', 'ping'
  ));

-- -------------------------------------------------------------------------
-- 2a. flashcard_decks
-- -------------------------------------------------------------------------
CREATE TABLE public.flashcard_decks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id        UUID NOT NULL REFERENCES public.module_lessons(id) ON DELETE CASCADE,
  title            TEXT NOT NULL DEFAULT 'Flashcards' CHECK (length(trim(title)) > 0),
  published        BOOLEAN NOT NULL DEFAULT false,
  created_by       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ai_generation_id UUID REFERENCES public.ai_generations(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX flashcard_decks_lesson_idx
  ON public.flashcard_decks (lesson_id);

CREATE INDEX flashcard_decks_created_idx
  ON public.flashcard_decks (lesson_id, created_at DESC);

-- updated_at trigger (reuse set_updated_at if it exists; create our own otherwise)
CREATE OR REPLACE FUNCTION public.tg_flashcard_decks_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER flashcard_decks_set_updated_at
  BEFORE UPDATE ON public.flashcard_decks
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_flashcard_decks_set_updated_at();

-- -------------------------------------------------------------------------
-- 2b. flashcards
-- -------------------------------------------------------------------------
CREATE TABLE public.flashcards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id       UUID NOT NULL REFERENCES public.flashcard_decks(id) ON DELETE CASCADE,
  front         TEXT NOT NULL CHECK (length(trim(front)) > 0),
  back          TEXT NOT NULL CHECK (length(trim(back)) > 0),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deck_id, display_order)
);

CREATE INDEX flashcards_deck_idx
  ON public.flashcards (deck_id, display_order);

-- -------------------------------------------------------------------------
-- 3. RLS
-- -------------------------------------------------------------------------
ALTER TABLE public.flashcard_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards     ENABLE ROW LEVEL SECURITY;

-- flashcard_decks SELECT: admin OR class teacher OR (enrolled student AND
-- deck.published AND lesson.published). Mirrors module_lessons_select.
CREATE POLICY flashcard_decks_select ON public.flashcard_decks
  FOR SELECT
  TO authenticated
  USING (
    get_user_role(auth.uid()) = 'admin'::user_role
    OR EXISTS (
      SELECT 1
      FROM public.module_lessons l
      JOIN public.class_modules m ON m.id = l.module_id
      WHERE l.id = flashcard_decks.lesson_id
        AND is_class_teacher(m.class_id, auth.uid())
    )
    OR (
      flashcard_decks.published = true
      AND EXISTS (
        SELECT 1
        FROM public.module_lessons l
        JOIN public.class_modules m ON m.id = l.module_id
        JOIN public.class_enrollments e ON e.class_id = m.class_id
        WHERE l.id = flashcard_decks.lesson_id
          AND l.published = true
          AND e.student_id = auth.uid()
      )
    )
  );

-- flashcard_decks INSERT/UPDATE/DELETE: teacher of parent class only
CREATE POLICY flashcard_decks_insert ON public.flashcard_decks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.module_lessons l
      JOIN public.class_modules m ON m.id = l.module_id
      WHERE l.id = flashcard_decks.lesson_id
        AND is_class_teacher(m.class_id, auth.uid())
    )
  );

CREATE POLICY flashcard_decks_update ON public.flashcard_decks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.module_lessons l
      JOIN public.class_modules m ON m.id = l.module_id
      WHERE l.id = flashcard_decks.lesson_id
        AND is_class_teacher(m.class_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.module_lessons l
      JOIN public.class_modules m ON m.id = l.module_id
      WHERE l.id = flashcard_decks.lesson_id
        AND is_class_teacher(m.class_id, auth.uid())
    )
  );

CREATE POLICY flashcard_decks_delete ON public.flashcard_decks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.module_lessons l
      JOIN public.class_modules m ON m.id = l.module_id
      WHERE l.id = flashcard_decks.lesson_id
        AND is_class_teacher(m.class_id, auth.uid())
    )
  );

-- flashcards table: visibility inherits the parent deck. We just check the
-- deck is selectable / mutable by the current user (RLS subquery on decks).
CREATE POLICY flashcards_select ON public.flashcards
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.flashcard_decks d
      WHERE d.id = flashcards.deck_id
    )
  );

CREATE POLICY flashcards_insert ON public.flashcards
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.flashcard_decks d
      JOIN public.module_lessons l ON l.id = d.lesson_id
      JOIN public.class_modules m ON m.id = l.module_id
      WHERE d.id = flashcards.deck_id
        AND is_class_teacher(m.class_id, auth.uid())
    )
  );

CREATE POLICY flashcards_update ON public.flashcards
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.flashcard_decks d
      JOIN public.module_lessons l ON l.id = d.lesson_id
      JOIN public.class_modules m ON m.id = l.module_id
      WHERE d.id = flashcards.deck_id
        AND is_class_teacher(m.class_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.flashcard_decks d
      JOIN public.module_lessons l ON l.id = d.lesson_id
      JOIN public.class_modules m ON m.id = l.module_id
      WHERE d.id = flashcards.deck_id
        AND is_class_teacher(m.class_id, auth.uid())
    )
  );

CREATE POLICY flashcards_delete ON public.flashcards
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.flashcard_decks d
      JOIN public.module_lessons l ON l.id = d.lesson_id
      JOIN public.class_modules m ON m.id = l.module_id
      WHERE d.id = flashcards.deck_id
        AND is_class_teacher(m.class_id, auth.uid())
    )
  );

COMMIT;