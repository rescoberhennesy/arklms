-- =====================================================================
-- AI Foundation Migration
-- Tables: ai_generations, ai_usage_log
-- Purpose: Foundational tables shared by all AI features.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ai_generations
-- One row per AI generation lifecycle (draft -> edited -> published).
-- Used by every feature: quiz, reviewer, activity_suggest, rubric,
-- analytics_insight, feedback, announcement.
-- ---------------------------------------------------------------------
CREATE TABLE public.ai_generations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id        uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  feature         text NOT NULL CHECK (feature IN (
                    'quiz', 'reviewer', 'activity_suggest', 'rubric',
                    'analytics_insight', 'feedback', 'announcement', 'ping'
                  )),
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN (
                    'draft', 'edited', 'published', 'discarded'
                  )),
  input_params    jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_output      jsonb,
  edited_output   jsonb,
  source_file_refs text[],
  model_used      text,
  tokens_used     integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz
);

CREATE INDEX ai_generations_teacher_recent_idx
  ON public.ai_generations (teacher_id, created_at DESC);
CREATE INDEX ai_generations_class_feature_idx
  ON public.ai_generations (class_id, feature);

CREATE TRIGGER ai_generations_set_updated_at
  BEFORE UPDATE ON public.ai_generations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- ai_usage_log
-- One row per Gemini API call (success or fail).
-- Used for rate limiting and thesis defense stats.
-- ---------------------------------------------------------------------
CREATE TABLE public.ai_usage_log (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature         text NOT NULL,
  model           text,
  input_tokens    integer,
  output_tokens   integer,
  status          text NOT NULL CHECK (status IN ('success', 'rate_limited', 'error')),
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_log_user_recent_idx
  ON public.ai_usage_log (user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- RLS
-- Teachers (and admins via get_user_role) see only their own rows.
-- Inserts/updates happen via service_role from server routes.
-- ---------------------------------------------------------------------
ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

-- ai_generations policies
CREATE POLICY ai_generations_select_owner ON public.ai_generations
  FOR SELECT TO authenticated
  USING (teacher_id = auth.uid());

CREATE POLICY ai_generations_select_admin ON public.ai_generations
  FOR SELECT TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin'::user_role);

CREATE POLICY ai_generations_insert_owner ON public.ai_generations
  FOR INSERT TO authenticated
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY ai_generations_update_owner ON public.ai_generations
  FOR UPDATE TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY ai_generations_delete_owner ON public.ai_generations
  FOR DELETE TO authenticated
  USING (teacher_id = auth.uid());

CREATE POLICY ai_generations_service_role ON public.ai_generations
  TO service_role USING (true) WITH CHECK (true);

-- ai_usage_log policies (read-only for users; writes via service_role)
CREATE POLICY ai_usage_log_select_owner ON public.ai_usage_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY ai_usage_log_select_admin ON public.ai_usage_log
  FOR SELECT TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin'::user_role);

CREATE POLICY ai_usage_log_service_role ON public.ai_usage_log
  TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.ai_generations IS 'Lifecycle of AI-generated content per teacher (draft/edited/published).';
COMMENT ON TABLE public.ai_usage_log  IS 'Every Gemini call logged for rate limiting and analytics.';
