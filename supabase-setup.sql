create extension if not exists pgcrypto;

create table if not exists public.report_counter (
  id int primary key default 1,
  count int not null default 0,
  last_diagnosed_at timestamptz null,
  constraint report_counter_single_row check (id = 1)
);

insert into public.report_counter (id, count, last_diagnosed_at)
values (1, 0, null)
on conflict (id) do nothing;

create table if not exists public.ai_helper_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  builder_tool text,
  break_type text,
  description text,
  generated_prompt text,
  confidence_level text
);

create table if not exists public.rollback_calculator_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  answers_json jsonb,
  recommendation text
);

create table if not exists public.prompt_checker_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  original_prompt text,
  risk_level text,
  rewritten_prompt text
);

alter table public.report_counter enable row level security;
alter table public.ai_helper_sessions enable row level security;
alter table public.rollback_calculator_sessions enable row level security;
alter table public.prompt_checker_sessions enable row level security;

drop policy if exists "public can read report counter" on public.report_counter;
create policy "public can read report counter"
on public.report_counter
for select
to anon
using (true);

drop policy if exists "public can insert ai helper sessions" on public.ai_helper_sessions;
create policy "public can insert ai helper sessions"
on public.ai_helper_sessions
for insert
to anon
with check (true);

drop policy if exists "public can insert rollback calculator sessions" on public.rollback_calculator_sessions;
create policy "public can insert rollback calculator sessions"
on public.rollback_calculator_sessions
for insert
to anon
with check (true);

drop policy if exists "public can insert prompt checker sessions" on public.prompt_checker_sessions;
create policy "public can insert prompt checker sessions"
on public.prompt_checker_sessions
for insert
to anon
with check (true);

create or replace function public.get_ai_helper_sessions_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer from public.ai_helper_sessions;
$$;

grant usage on schema public to anon;
grant select on public.report_counter to anon;
grant insert on public.ai_helper_sessions to anon;
grant insert on public.rollback_calculator_sessions to anon;
grant insert on public.prompt_checker_sessions to anon;
grant execute on function public.get_ai_helper_sessions_count() to anon;
