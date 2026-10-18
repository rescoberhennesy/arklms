-- Drafts have no submission time yet; submit_activity sets submitted_at = NULL
-- when p_is_draft is true and fills it in on the real submit.
alter table public.activity_submissions
  alter column submitted_at drop not null;
