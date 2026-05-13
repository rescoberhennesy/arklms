-- Allow authenticated users to insert their own usage log rows.
-- The user_id must match auth.uid() so they can't log under another user's id.

CREATE POLICY ai_usage_log_insert_owner ON public.ai_usage_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
