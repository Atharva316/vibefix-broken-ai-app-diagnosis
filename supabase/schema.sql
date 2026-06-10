-- VibeFix Supabase schema
-- Run this in Supabase SQL editor or as a migration.

create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('user', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_status as enum ('pending', 'authorized', 'paid', 'failed', 'refunded', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.report_status as enum ('draft', 'generated', 'delivered', 'downloaded', 'archived');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  phone text,
  avatar_url text,
  role public.user_role not null default 'user',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text,
  line1 text,
  line2 text,
  city text,
  state text,
  country text,
  postal_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app_name text not null,
  live_app_url text,
  preview_url text,
  repo_link text,
  build_tool text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app_id uuid references public.apps(id) on delete set null,
  provider text not null default 'razorpay',
  razorpay_order_id text,
  razorpay_payment_id text unique,
  razorpay_signature text,
  amount integer,
  currency text default 'INR',
  status public.payment_status not null default 'pending',
  payment_email text,
  raw_payload jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intake_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app_id uuid references public.apps(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  source text,
  break_type text not null,
  app_context text not null,
  app_users text not null,
  working_before text not null,
  broken_now text not null,
  when_broke text not null,
  last_change text not null,
  already_tried text not null,
  error_message text,
  evidence_links text,
  issue_location text not null,
  diagnosis_priority text not null,
  focus_areas text,
  do_not_touch text,
  test_login_available text,
  test_login_details text,
  scope_confirmation boolean not null default false,
  missing_info_confirmation boolean not null default false,
  payment_confirmation boolean not null default false,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.diagnosis_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app_id uuid references public.apps(id) on delete set null,
  submission_id uuid references public.intake_submissions(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  report_code text not null unique,
  status public.report_status not null default 'draft',
  report_html text not null,
  report_markdown text,
  report_json jsonb not null default '{}'::jsonb,
  download_token text not null,
  generated_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_downloads (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.diagnosis_reports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  downloaded_at timestamptz not null default now(),
  ip_address text,
  user_agent text
);

create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists apps_user_id_idx on public.apps(user_id);
create index if not exists payments_user_id_idx on public.payments(user_id);
create index if not exists payments_app_id_idx on public.payments(app_id);
create index if not exists payments_status_idx on public.payments(status);
create index if not exists intake_user_id_idx on public.intake_submissions(user_id);
create index if not exists intake_payment_id_idx on public.intake_submissions(payment_id);
create index if not exists reports_user_id_idx on public.diagnosis_reports(user_id);
create index if not exists reports_payment_id_idx on public.diagnosis_reports(payment_id);
create index if not exists report_downloads_report_id_idx on public.report_downloads(report_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_user_addresses_updated_at on public.user_addresses;
create trigger set_user_addresses_updated_at
before update on public.user_addresses
for each row execute function public.set_updated_at();

drop trigger if exists set_apps_updated_at on public.apps;
create trigger set_apps_updated_at
before update on public.apps
for each row execute function public.set_updated_at();

drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

drop trigger if exists set_intake_submissions_updated_at on public.intake_submissions;
create trigger set_intake_submissions_updated_at
before update on public.intake_submissions
for each row execute function public.set_updated_at();

drop trigger if exists set_diagnosis_reports_updated_at on public.diagnosis_reports;
create trigger set_diagnosis_reports_updated_at
before update on public.diagnosis_reports
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_addresses enable row level security;
alter table public.apps enable row level security;
alter table public.payments enable row level security;
alter table public.intake_submissions enable row level security;
alter table public.diagnosis_reports enable row level security;
alter table public.report_downloads enable row level security;
alter table public.admin_activity_logs enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  );
$$;

create or replace function public.touch_profile_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    'user'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
        avatar_url = coalesce(nullif(excluded.avatar_url, ''), public.profiles.avatar_url),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.touch_profile_on_signup();

create policy "profiles_select_own" on public.profiles
for select using (auth.uid() = id or public.is_admin());

create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

create policy "profiles_insert_admin" on public.profiles
for insert with check (public.is_admin());

create policy "addresses_select_own" on public.user_addresses
for select using (auth.uid() = user_id or public.is_admin());

create policy "addresses_write_own" on public.user_addresses
for all using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

create policy "apps_select_own" on public.apps
for select using (auth.uid() = user_id or public.is_admin());

create policy "apps_write_own" on public.apps
for all using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

create policy "payments_select_own" on public.payments
for select using (auth.uid() = user_id or public.is_admin());

create policy "payments_insert_backend_only" on public.payments
for insert with check (public.is_admin());

create policy "payments_update_backend_only" on public.payments
for update using (public.is_admin())
with check (public.is_admin());

create policy "submissions_select_own" on public.intake_submissions
for select using (auth.uid() = user_id or public.is_admin());

create policy "submissions_insert_own" on public.intake_submissions
for insert with check (auth.uid() = user_id or public.is_admin());

create policy "submissions_update_own_or_admin" on public.intake_submissions
for update using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

create policy "reports_select_own" on public.diagnosis_reports
for select using (auth.uid() = user_id or public.is_admin());

create policy "reports_insert_backend_only" on public.diagnosis_reports
for insert with check (public.is_admin());

create policy "reports_update_backend_only" on public.diagnosis_reports
for update using (public.is_admin())
with check (public.is_admin());

create policy "downloads_select_own" on public.report_downloads
for select using (auth.uid() = user_id or public.is_admin());

create policy "downloads_insert_own_or_admin" on public.report_downloads
for insert with check (auth.uid() = user_id or public.is_admin());

create policy "admin_logs_admin_only" on public.admin_activity_logs
for all using (public.is_admin())
with check (public.is_admin());
