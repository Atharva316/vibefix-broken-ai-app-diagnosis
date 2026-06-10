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

create table if not exists public.vibefix_scans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text null,
  email text null,
  builder text,
  break_type text,
  issue_location text,
  break_timing text,
  last_working_state text,
  current_broken_behavior text,
  last_prompt text,
  last_ai_tool text,
  original_ai_tool text,
  fix_attempts text,
  rollback_available text,
  error_message text,
  risk_score int,
  prompt_again_risk text,
  likely_break_layer text,
  confidence_score text,
  no_touch_zones text[],
  safe_first_prompt text,
  missing_evidence text[],
  raw_payload jsonb
);

create table if not exists public.vibefix_prompt_checks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  prompt_text text,
  risk_level text,
  risky_phrases text[],
  safe_rewrite text,
  raw_payload jsonb
);

create table if not exists public.vibefix_intakes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  razorpay_payment_id text,
  name text,
  email text,
  app_name text,
  live_url text,
  preview_url text,
  repo_url text,
  builder text,
  break_type text,
  last_working_state text,
  current_broken_behavior text,
  last_prompt text,
  recent_prompts text[],
  last_ai_tool text,
  original_ai_tool text,
  fix_attempts text,
  error_message text,
  evidence_links text,
  issue_location text,
  rollback_available text,
  no_touch_areas text,
  test_login_available text,
  raw_payload jsonb
);

create table if not exists public.vibefix_case_files (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  case_type text,
  risk_score int,
  likely_break_layer text,
  payload jsonb,
  result jsonb
);

alter table public.report_counter enable row level security;
alter table public.ai_helper_sessions enable row level security;
alter table public.rollback_calculator_sessions enable row level security;
alter table public.prompt_checker_sessions enable row level security;
alter table public.vibefix_scans enable row level security;
alter table public.vibefix_prompt_checks enable row level security;
alter table public.vibefix_intakes enable row level security;
alter table public.vibefix_case_files enable row level security;

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

drop policy if exists "public can insert vibefix scans" on public.vibefix_scans;
create policy "public can insert vibefix scans"
on public.vibefix_scans
for insert
to anon
with check (true);

drop policy if exists "public can insert vibefix prompt checks" on public.vibefix_prompt_checks;
create policy "public can insert vibefix prompt checks"
on public.vibefix_prompt_checks
for insert
to anon
with check (true);

drop policy if exists "public can insert vibefix intakes" on public.vibefix_intakes;
create policy "public can insert vibefix intakes"
on public.vibefix_intakes
for insert
to anon
with check (true);

drop policy if exists "public can insert vibefix case files" on public.vibefix_case_files;
create policy "public can insert vibefix case files"
on public.vibefix_case_files
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
grant insert on public.vibefix_scans to anon;
grant insert on public.vibefix_prompt_checks to anon;
grant insert on public.vibefix_intakes to anon;
grant insert on public.vibefix_case_files to anon;
grant execute on function public.get_ai_helper_sessions_count() to anon;
