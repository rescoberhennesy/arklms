-- Session 13: notifications surface.
--
-- Each row is one notification delivered to one recipient. When something
-- relevant happens (announcement posted, grade released, etc.), an
-- inserter helper in src/lib/actions/notifications.ts writes one row per
-- affected recipient. Recipients see the dropdown in the TopNavbar bell.
--
-- Design notes:
-- - Per-row read_at tracking (not a cursor) so "mark this one as read"
--   and "mark all as read" both work cleanly
-- - ref_id is intentionally untyped (text-or-uuid would force a discriminated
--   union); we keep it as uuid since all current trigger sources reference
--   uuid PKs. If a future trigger references a non-uuid entity, we'd add
--   a separate column rather than coercing.
-- - link_path stored at insertion time (denormalized). If we rename routes
--   we patch in a follow-up migration. Trade-off: zero-join read path.
-- - No "category" enum at the DB level; the type column is free-form text.
--   This lets us add notification types without DDL — just update the TS
--   union in src/lib/types/notifications.ts and ship.

CREATE TABLE public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        text NOT NULL,
  ref_id      uuid,
  title       text NOT NULL,
  body        text,
  link_path   text NOT NULL,
  read_at     timestamp with time zone,
  created_at  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notifications_title_check CHECK (length(trim(title)) > 0),
  CONSTRAINT notifications_link_path_check CHECK (length(link_path) > 0)
);

-- Index for the dropdown query: recent items for a given user.
CREATE INDEX notifications_user_recent_idx
  ON public.notifications (user_id, created_at DESC);

-- Partial index for unread count (the badge needs this on every page load).
CREATE INDEX notifications_user_unread_idx
  ON public.notifications (user_id)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users read their own notifications.
CREATE POLICY notifications_select_self
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins read everything (for support / debugging).
CREATE POLICY notifications_select_admin
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- Users mark their own notifications as read.
-- WITH CHECK enforces user_id can't be reassigned during update.
CREATE POLICY notifications_update_self
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- INSERT policy: any authenticated user can insert a notification for ANY
-- user_id. This is intentionally permissive — the inserter helpers in
-- notifications.ts are called from server actions running in the trigger
-- source's session (e.g. teacher posts announcement → that server action
-- runs as the teacher, but inserts notifications targeting each enrolled
-- student). Restricting INSERT to user_id = auth.uid() would prevent this.
--
-- The trade-off: a malicious authenticated user could spam any user's
-- notifications. Acceptable for v1 — trigger sites are server actions,
-- not direct client API calls. If abuse becomes a concern, we'd add an
-- RPC layer with per-type validation.
CREATE POLICY notifications_insert_authenticated
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users delete their own notifications (e.g. dismiss). Not exposed in v1 UI
-- but the policy is here for future use.
CREATE POLICY notifications_delete_self
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
