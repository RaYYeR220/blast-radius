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
  snapshot text not null,
  version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

-- The boards are public; nothing else is readable or writable without the service role.
create policy runs_public_read on public.runs for select to anon, authenticated using (true);

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
