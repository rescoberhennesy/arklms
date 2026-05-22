-- ============================================================================
-- AI Practice — student-driven practice sessions
-- ============================================================================
-- A student generates a "session" from a source (lesson or uploaded file).
-- The session stores the questions; the student can take it ("attempt")
-- repeatedly. Each attempt records responses and a score so the student
-- can see improvement over time.
--
-- Design notes:
--   - practice_sessions / practice_questions / practice_attempts are owned
--     by the student. RLS scopes everything to student_id = auth.uid().
--   - Question kinds are limited to the 4 auto-gradable kinds (same as
--     the teacher AI generator). Self-grading is deterministic and cheap.
--   - Attempt scoring is computed server-side at submit time and stored;
--     we don't re-compute on every read (consistent history if the
--     student edits a question's config, which they shouldn't be able
--     to anyway — questions are read-only post-generation).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

create type practice_source_kind as enum ('lesson', 'upload');
create type practice_difficulty as enum ('easy', 'medium', 'hard', 'mixed');
-- Mirror of quiz_questions kinds, restricted to the AI-generatable subset.
create type practice_question_kind as enum (
  'mc_single',
  'mc_multi',
  'true_false',
  'short_answer'
);

-- ----------------------------------------------------------------------------
-- Sessions
-- ----------------------------------------------------------------------------

create table practice_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  source_kind practice_source_kind not null,
  source_lesson_id uuid references module_lessons(id) on delete set null,
  source_file_names text[] not null default '{}'::text[],
  source_note text,
  difficulty practice_difficulty not null default 'mixed',
  requested_count integer not null check (requested_count between 1 and 25),
  model_used text,
  tokens_used integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index practice_sessions_student_idx
  on practice_sessions (student_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Questions (one row per question in a session; read-only after generation)
-- ----------------------------------------------------------------------------

create table practice_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references practice_sessions(id) on delete cascade,
  question_kind practice_question_kind not null,
  prompt text not null,
  points integer not null check (points > 0),
  display_order integer not null,
  config jsonb not null,
  explanation text,
  created_at timestamptz not null default now()
);

create unique index practice_questions_order_idx
  on practice_questions (session_id, display_order);

-- ----------------------------------------------------------------------------
-- Attempts (one row per take-through of a session)
-- ----------------------------------------------------------------------------

create table practice_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references practice_sessions(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score integer,
  max_score integer,
  responses jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index practice_attempts_session_idx
  on practice_attempts (session_id, started_at desc);
create index practice_attempts_student_idx
  on practice_attempts (student_id, started_at desc);

-- ----------------------------------------------------------------------------
-- updated_at trigger
-- ----------------------------------------------------------------------------

create trigger practice_sessions_updated_at
  before update on practice_sessions
  for each row execute function set_updated_at();

create trigger practice_attempts_updated_at
  before update on practice_attempts
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — students own their sessions, no one else sees them
-- ----------------------------------------------------------------------------

alter table practice_sessions enable row level security;
alter table practice_questions enable row level security;
alter table practice_attempts enable row level security;

create policy practice_sessions_owner_select on practice_sessions
  for select using (student_id = auth.uid());
create policy practice_sessions_owner_insert on practice_sessions
  for insert with check (student_id = auth.uid());
create policy practice_sessions_owner_update on practice_sessions
  for update using (student_id = auth.uid())
  with check (student_id = auth.uid());
create policy practice_sessions_owner_delete on practice_sessions
  for delete using (student_id = auth.uid());

create policy practice_questions_owner_select on practice_questions
  for select using (
    exists (
      select 1 from practice_sessions s
      where s.id = practice_questions.session_id
        and s.student_id = auth.uid()
    )
  );
create policy practice_questions_owner_insert on practice_questions
  for insert with check (
    exists (
      select 1 from practice_sessions s
      where s.id = practice_questions.session_id
        and s.student_id = auth.uid()
    )
  );

create policy practice_attempts_owner_select on practice_attempts
  for select using (student_id = auth.uid());
create policy practice_attempts_owner_insert on practice_attempts
  for insert with check (student_id = auth.uid());
create policy practice_attempts_owner_update on practice_attempts
  for update using (student_id = auth.uid())
  with check (student_id = auth.uid());
create policy practice_attempts_owner_delete on practice_attempts
  for delete using (student_id = auth.uid());
