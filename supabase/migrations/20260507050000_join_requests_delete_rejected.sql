-- Phase 5b #6 -- let students dismiss their own rejected join requests.
--
-- Existing policy class_join_requests_delete_own_pending covers cancel
-- of pending requests. This adds a sibling policy for rejected ones so the
-- UI's Dismiss button can actually delete the row.

DROP POLICY IF EXISTS class_join_requests_delete_own_rejected ON public.class_join_requests;
CREATE POLICY class_join_requests_delete_own_rejected
  ON public.class_join_requests
  FOR DELETE
  TO authenticated
  USING (student_id = auth.uid() AND status = 'rejected');
