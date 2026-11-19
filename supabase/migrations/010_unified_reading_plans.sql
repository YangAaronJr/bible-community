-- ============================================================================
-- Migration 010: Unified Reading Plans & Circle Plan Updates
--   1. reading_plans table (Personal & Circle plans under one model)
--   2. circle_plan_updates table (opt-in prompts when a Circle changes plan)
-- ============================================================================

create table if not exists public.reading_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete cascade,
  preset_id text,
  title text not null,
  books text[] not null default '{}',
  chapters_per_day integer not null default 1 check (chapters_per_day >= 1 and chapters_per_day <= 10),
  rest_days integer[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reading_plans_owner_active
  on public.reading_plans (owner_id, is_active);

create index if not exists idx_reading_plans_circle_active
  on public.reading_plans (circle_id, is_active)
  where circle_id is not null;

alter table public.reading_plans enable row level security;

drop policy if exists "Reading plans select personal or circle member" on public.reading_plans;
create policy "Reading plans select personal or circle member"
  on public.reading_plans for select
  to authenticated
  using (
    (circle_id is null and auth.uid() = owner_id)
    or (circle_id is not null and public.is_circle_member(circle_id))
  );

drop policy if exists "Reading plans insert personal or circle member" on public.reading_plans;
create policy "Reading plans insert personal or circle member"
  on public.reading_plans for insert
  to authenticated
  with check (
    (circle_id is null and auth.uid() = owner_id)
    or (circle_id is not null and auth.uid() = owner_id and public.is_circle_member(circle_id))
  );

drop policy if exists "Reading plans update personal or circle member" on public.reading_plans;
create policy "Reading plans update personal or circle member"
  on public.reading_plans for update
  to authenticated
  using (
    (circle_id is null and auth.uid() = owner_id)
    or (circle_id is not null and public.is_circle_member(circle_id))
  )
  with check (
    (circle_id is null and auth.uid() = owner_id)
    or (circle_id is not null and public.is_circle_member(circle_id))
  );

drop policy if exists "Reading plans delete personal or circle member" on public.reading_plans;
create policy "Reading plans delete personal or circle member"
  on public.reading_plans for delete
  to authenticated
  using (
    (circle_id is null and auth.uid() = owner_id)
    or (circle_id is not null and public.is_circle_member(circle_id))
  );

-- ----------------------------------------------------------------------------
-- 2. CIRCLE_PLAN_UPDATES TABLE (Opt-in plan change prompts for Circle members)
-- ----------------------------------------------------------------------------
create table if not exists public.circle_plan_updates (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null,
  plan_title text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_circle_plan_updates_circle_created
  on public.circle_plan_updates (circle_id, created_at desc);

alter table public.circle_plan_updates enable row level security;

drop policy if exists "Circle plan updates readable by circle members" on public.circle_plan_updates;
create policy "Circle plan updates readable by circle members"
  on public.circle_plan_updates for select
  to authenticated
  using (public.is_circle_member(circle_id));

drop policy if exists "Circle plan updates insertable by circle members" on public.circle_plan_updates;
create policy "Circle plan updates insertable by circle members"
  on public.circle_plan_updates for insert
  to authenticated
  with check (auth.uid() = actor_id and public.is_circle_member(circle_id));
