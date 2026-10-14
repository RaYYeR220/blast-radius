-- Verified runs. Rows are written only by the server after it re-simulates the replay.
create table public.runs (
  id uuid primary key,
  board text not null check (board in ('daily', 'endless', 'agents')),
  mode text not null,
  seed text not null,
  day date,
  sim_version int not null,
  player_kind text not null check (player_kind in ('human', 'agent')),
  name text not null,
  score int not null,
  waves int not null,
  shipped int not null,
  intercepts int not null,
  infected int not null,
  ended_by text not null,
  duration_ticks int not null,
  root_payload int,
  actions jsonb not null,
  outcome_hash text not null unique,
  owner_hash text not null,
  created_at timestamptz not null default now()
);
create index runs_board_day_score on public.runs (board, day, score desc, created_at);
create unique index runs_endless_seed on public.runs (seed) where board = 'endless';

-- Live agent games: the action log plus a resumable state snapshot.
create table public.agent_sessions (
  id uuid primary key,
  seed text not null,
  mode text not null,
  actions jsonb not null default '[]',
  tick int not null default 0,
  status text not null default 'live' check (status in ('live', 'over', 'submitted')),
  agent_name text,
  owner_hash text not null,
  snapshot text not null,
  version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A display name belongs to the first device (or agent key) that used it.
create table public.names (
  name_key text primary key,
  owner_hash text not null,
  created_at timestamptz not null default now()
);

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

alter table public.runs enable row level security;
alter table public.agent_sessions enable row level security;
alter table public.rate_limits enable row level security;
alter table public.names enable row level security;

-- No policies: RLS denies every anon/authenticated read and write. Boards are served
-- only through the API (service role), which never returns owner or outcome hashes.
revoke all on public.runs, public.agent_sessions, public.names, public.rate_limits from anon, authenticated;

create or replace function public.bump_rate(p_key text, p_window timestamptz, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare c int;
begin
  insert into public.rate_limits (key, window_start, count) values (p_key, p_window, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
  returning count into c;
  return c <= p_limit;
end
$$;
revoke all on function public.bump_rate(text, timestamptz, int) from public, anon, authenticated;
