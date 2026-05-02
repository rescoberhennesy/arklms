-- ============================================================================
-- Session 3: schema changes for class polish, join flow, approvals
-- ============================================================================

-- ----- 1. classes table changes ---------------------------------------------

-- Drop subject_code (no longer collected)
ALTER TABLE public.classes DROP COLUMN IF EXISTS subject_code;

-- Constrain semester to two values; back-fill anything weird to '1st Semester'
UPDATE public.classes
SET semester = '1st Semester'
WHERE semester IS NULL OR semester NOT IN ('1st Semester', '2nd Semester');

ALTER TABLE public.classes
  ALTER COLUMN semester SET NOT NULL,
  ADD CONSTRAINT classes_semester_check
    CHECK (semester IN ('1st Semester', '2nd Semester'));

-- Cover photo (nullable; UI will fall back to color)
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS cover_photo_url text;

-- Invite code lifecycle
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS invite_code_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_code_disabled  boolean NOT NULL DEFAULT false;

-- Default expiration window (7 days) for any existing rows that don't have one
UPDATE public.classes
SET invite_code_expires_at = now() + interval '7 days'
WHERE invite_code_expires_at IS NULL;

-- ----- 2. invite-code helper -------------------------------------------------
-- Wrap regeneration so we set expiration atomically. Teachers pass a window
-- in hours; NULL means "never expires".

CREATE OR REPLACE FUNCTION public.regenerate_class_invite_code(
  p_class_id   uuid,
  p_expires_in_hours integer DEFAULT 168  -- 7 days
)
RETURNS TABLE (invite_code text, invite_code_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_code text;
  v_expires  timestamptz;
BEGIN
  -- Authorization: caller must be the teacher of the class
  IF NOT public.is_class_teacher(auth.uid(), p_class_id) THEN
    RAISE EXCEPTION 'not authorized to regenerate invite code for this class';
  END IF;

  v_new_code := public.generate_invite_code();
  v_expires  := CASE
                  WHEN p_expires_in_hours IS NULL THEN NULL
                  ELSE now() + make_interval(hours => p_expires_in_hours)
                END;

  UPDATE public.classes
  SET invite_code            = v_new_code,
      invite_code_expires_at = v_expires,
      invite_code_disabled   = false,
      updated_at             = now()
  WHERE id = p_class_id;

  RETURN QUERY
  SELECT v_new_code, v_expires;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_class_invite_code(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.regenerate_class_invite_code(uuid, integer) TO authenticated;

-- ----- 3. join requests ------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.join_request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.class_join_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id     uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status       public.join_request_status NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  decided_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- a student can only have ONE active (pending) request per class; old
  -- approved/rejected rows are kept for history
  CONSTRAINT class_join_requests_unique_pending
    EXCLUDE (class_id WITH =, student_id WITH =) WHERE (status = 'pending')
);

CREATE INDEX IF NOT EXISTS class_join_requests_class_idx
  ON public.class_join_requests (class_id, status);
CREATE INDEX IF NOT EXISTS class_join_requests_student_idx
  ON public.class_join_requests (student_id, status);

ALTER TABLE public.class_join_requests ENABLE ROW LEVEL SECURITY;

-- Per-command policies (no FOR ALL — lesson learned from session 2)

-- Students see their own requests
CREATE POLICY class_join_requests_select_own
  ON public.class_join_requests FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

-- Teachers see requests for their classes
CREATE POLICY class_join_requests_select_teacher
  ON public.class_join_requests FOR SELECT
  TO authenticated
  USING (public.is_class_teacher(auth.uid(), class_id));

-- Admins see all
CREATE POLICY class_join_requests_select_admin
  ON public.class_join_requests FOR SELECT
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- Inserts go through the join_class_by_code RPC (SECURITY DEFINER), so we
-- don't need a permissive INSERT policy for normal users. Admins can insert
-- directly if they really want to.
CREATE POLICY class_join_requests_insert_admin
  ON public.class_join_requests FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- Teachers update (approve/reject) requests in their class
CREATE POLICY class_join_requests_update_teacher
  ON public.class_join_requests FOR UPDATE
  TO authenticated
  USING (public.is_class_teacher(auth.uid(), class_id))
  WITH CHECK (public.is_class_teacher(auth.uid(), class_id));

-- Admins can update anything
CREATE POLICY class_join_requests_update_admin
  ON public.class_join_requests FOR UPDATE
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- Students may cancel (delete) their own pending request
CREATE POLICY class_join_requests_delete_own_pending
  ON public.class_join_requests FOR DELETE
  TO authenticated
  USING (student_id = auth.uid() AND status = 'pending');

CREATE POLICY class_join_requests_delete_admin
  ON public.class_join_requests FOR DELETE
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- ----- 4. RPC: submit a join request by code --------------------------------

CREATE OR REPLACE FUNCTION public.request_join_class_by_code(p_code text)
RETURNS TABLE (
  class_id uuid,
  status   public.join_request_status,
  message  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_class   public.classes%ROWTYPE;
  v_user    uuid := auth.uid();
  v_role    public.user_role;
  v_existing_request public.class_join_requests%ROWTYPE;
  v_already_enrolled boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_role := public.get_user_role(v_user);
  IF v_role <> 'student' THEN
    RAISE EXCEPTION 'only students can join classes by code';
  END IF;

  -- Look up the class (case-insensitive on code, codes are lowercase already)
  SELECT * INTO v_class
  FROM public.classes
  WHERE lower(invite_code) = lower(trim(p_code))
    AND is_archived = false
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid invite code';
  END IF;

  IF v_class.invite_code_disabled THEN
    RAISE EXCEPTION 'invite code is disabled';
  END IF;

  IF v_class.invite_code_expires_at IS NOT NULL
     AND v_class.invite_code_expires_at < now() THEN
    RAISE EXCEPTION 'invite code has expired';
  END IF;

  -- Already enrolled?
  SELECT EXISTS (
    SELECT 1 FROM public.class_enrollments
    WHERE class_id = v_class.id AND student_id = v_user
  ) INTO v_already_enrolled;

  IF v_already_enrolled THEN
    RETURN QUERY SELECT v_class.id, 'approved'::public.join_request_status,
                        'already enrolled'::text;
    RETURN;
  END IF;

  -- Existing pending request?
  SELECT * INTO v_existing_request
  FROM public.class_join_requests
  WHERE class_id = v_class.id
    AND student_id = v_user
    AND status = 'pending'
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_class.id, v_existing_request.status,
                        'request already pending'::text;
    RETURN;
  END IF;

  -- Insert new pending request
  INSERT INTO public.class_join_requests (class_id, student_id, status)
  VALUES (v_class.id, v_user, 'pending');

  RETURN QUERY SELECT v_class.id, 'pending'::public.join_request_status,
                      'request submitted'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.request_join_class_by_code(text) FROM public;
GRANT EXECUTE ON FUNCTION public.request_join_class_by_code(text) TO authenticated;

-- ----- 5. RPC: teacher decides on a request ---------------------------------

CREATE OR REPLACE FUNCTION public.decide_join_request(
  p_request_id uuid,
  p_approve    boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.class_join_requests%ROWTYPE;
  v_user    uuid := auth.uid();
BEGIN
  SELECT * INTO v_request
  FROM public.class_join_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request not found';
  END IF;

  IF NOT public.is_class_teacher(v_user, v_request.class_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'request already decided';
  END IF;

  IF p_approve THEN
    INSERT INTO public.class_enrollments (class_id, student_id)
    VALUES (v_request.class_id, v_request.student_id)
    ON CONFLICT DO NOTHING;

    UPDATE public.class_join_requests
    SET status = 'approved', decided_at = now(), decided_by = v_user
    WHERE id = p_request_id;
  ELSE
    UPDATE public.class_join_requests
    SET status = 'rejected', decided_at = now(), decided_by = v_user
    WHERE id = p_request_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_join_request(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.decide_join_request(uuid, boolean) TO authenticated;

-- ----- 6. unique-enrollment guard (defense in depth) ------------------------

CREATE UNIQUE INDEX IF NOT EXISTS class_enrollments_unique_pair
  ON public.class_enrollments (class_id, student_id);