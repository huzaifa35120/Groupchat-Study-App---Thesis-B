-- Group chat study: initial schema
-- Every table has row-level security enabled. The web app talks to the database
-- only from the server with the service-role key; signed-in researchers can also
-- read through the Supabase API. Anonymous (anon key) access is denied everywhere.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Researchers (the student investigator and supervisor)
-- ---------------------------------------------------------------------------
create table if not exists public.researchers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

create or replace function public.is_researcher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.researchers where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Study groups: the same three people take part in every session of a group
-- ---------------------------------------------------------------------------
create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- Participants are identified only by a made-up name. The access code they
-- receive when joining is stored as a SHA-256 hash.
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete cascade,
  pseudonym text not null,
  access_code_hash text not null unique,
  consent jsonb not null,
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists participants_group_pseudonym_idx
  on public.participants (group_id, lower(pseudonym));

-- ---------------------------------------------------------------------------
-- Chat sessions
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete cascade,
  session_number int not null,
  title text not null,
  topic text not null,
  duration_seconds int not null default 600 check (duration_seconds between 60 and 7200),
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended')),
  started_at timestamptz,
  ends_at timestamptz,
  ended_at timestamptz,
  -- Conversation statistics recorded automatically when the session ends
  stats jsonb,
  stats_computed_at timestamptz,
  -- How the gaps were chosen (seed, ratio, rules)
  mask_config jsonb,
  created_at timestamptz not null default now(),
  unique (group_id, session_number)
);

-- ---------------------------------------------------------------------------
-- Messages. Operator (researcher) messages are stored but flagged so they are
-- never masked, predicted, scored or counted in results.
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,
  participant_id uuid references public.participants (id) on delete cascade,
  is_operator boolean not null default false,
  author_label text not null,
  body text not null check (char_length(body) between 1 and 2000),
  client_id uuid,
  created_at timestamptz not null default now(),
  is_masked boolean not null default false,
  msg_type text,
  unique (session_id, client_id),
  check ((is_operator and participant_id is null) or (not is_operator and participant_id is not null)),
  check (not (is_operator and is_masked))
);
create index if not exists messages_session_idx on public.messages (session_id, id);

-- ---------------------------------------------------------------------------
-- AI prediction runs: one run = one model/prompt/context configuration
-- applied to the masked messages of the chosen sessions.
-- ---------------------------------------------------------------------------
create table if not exists public.prediction_runs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  model text not null,
  config jsonb not null,
  session_ids uuid[] not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed')),
  total int not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Each AI-written message is stored next to the original it replaced, together
-- with the exact prompt, model and settings that produced it.
create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.prediction_runs (id) on delete cascade,
  message_id bigint not null references public.messages (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'done', 'error')),
  position_index int not null,
  original_text text not null,
  predicted_text text,
  system_prompt text,
  prompt text,
  context_before int,
  context_after int,
  model text,
  stop_reason text,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  metrics jsonb,
  error text,
  attempts int not null default 0,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (run_id, message_id)
);
create index if not exists predictions_run_idx on public.predictions (run_id, status);

-- Rubric scores (0-3) from human raters and from the LLM judge
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions (id) on delete cascade,
  rater text not null,
  rater_type text not null check (rater_type in ('human', 'llm')),
  score int not null check (score between 0 and 3),
  failure_tags text[] not null default '{}',
  msg_type text,
  notes text,
  details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prediction_id, rater)
);
create index if not exists scores_prediction_idx on public.scores (prediction_id);

-- Optional "send me the results summary" emails. Deliberately not linked to
-- participants or transcripts.
create table if not exists public.summary_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);

-- Anonymous log of withdrawals (no identifiers), for reporting attrition.
create table if not exists public.withdrawal_log (
  id uuid primary key default gen_random_uuid(),
  group_name text,
  sessions_deleted int not null,
  messages_deleted int not null,
  initiated_by text not null check (initiated_by in ('participant', 'researcher')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.researchers enable row level security;
alter table public.study_groups enable row level security;
alter table public.participants enable row level security;
alter table public.sessions enable row level security;
alter table public.messages enable row level security;
alter table public.prediction_runs enable row level security;
alter table public.predictions enable row level security;
alter table public.scores enable row level security;
alter table public.summary_requests enable row level security;
alter table public.withdrawal_log enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'researchers', 'study_groups', 'participants', 'sessions', 'messages',
    'prediction_runs', 'predictions', 'scores', 'summary_requests', 'withdrawal_log'
  ]
  loop
    execute format('drop policy if exists "researchers can read" on public.%I', t);
    execute format(
      'create policy "researchers can read" on public.%I for select to authenticated using (public.is_researcher())',
      t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Work queue helper: atomically claim pending predictions so concurrent
-- workers never process the same gap twice.
-- ---------------------------------------------------------------------------
create or replace function public.claim_predictions(p_run uuid, p_limit int)
returns setof public.predictions
language sql
as $$
  update public.predictions p
     set claimed_at = now(), attempts = p.attempts + 1
   where p.id in (
     select id from public.predictions
      where run_id = p_run
        and status = 'pending'
        and (claimed_at is null or claimed_at < now() - interval '4 minutes')
      order by session_id, position_index
      limit p_limit
      for update skip locked
   )
  returning p.*;
$$;

revoke all on function public.claim_predictions(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_predictions(uuid, int) to service_role;
revoke all on function public.is_researcher() from public, anon;
grant execute on function public.is_researcher() to authenticated;
