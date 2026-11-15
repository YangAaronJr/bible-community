-- ============================================================================
-- Migration: 003_wave2_prayer_plans_milestones.sql
-- Description: Wave 2 additive migration:
--   1. prayer_requests table + RLS (circle members)
--   2. prayer_responses table + RLS (circle members via parent prayer request)
--   3. custom_schedules table + RLS (strictly private to auth.uid() = user_id)
--   4. Enable Supabase Realtime on prayer_requests and prayer_responses
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PRAYER_REQUESTS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_answered boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.prayer_requests enable row level security;

drop policy if exists "Prayer requests viewable by circle members" on public.prayer_requests;
create policy "Prayer requests viewable by circle members"
  on public.prayer_requests for select
  to authenticated
  using (public.is_circle_member(circle_id));

drop policy if exists "Prayer requests insertable by circle members" on public.prayer_requests;
create policy "Prayer requests insertable by circle members"
  on public.prayer_requests for insert
  to authenticated
  with check (
    auth.uid() = user_id and public.is_circle_member(circle_id)
  );

drop policy if exists "Authors can update their own prayer requests" on public.prayer_requests;
create policy "Authors can update their own prayer requests"
  on public.prayer_requests for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Authors can delete their own prayer requests" on public.prayer_requests;
create policy "Authors can delete their own prayer requests"
  on public.prayer_requests for delete
  to authenticated
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2. PRAYER_RESPONSES TABLE ("Praying for you" gentle fellowship responses)
-- ----------------------------------------------------------------------------
create table if not exists public.prayer_responses (
  prayer_id uuid not null references public.prayer_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (prayer_id, user_id)
);

alter table public.prayer_responses enable row level security;

drop policy if exists "Prayer responses viewable by circle members" on public.prayer_responses;
create policy "Prayer responses viewable by circle members"
  on public.prayer_responses for select
  to authenticated
  using (
    exists (
      select 1
      from public.prayer_requests pr
      where pr.id = prayer_responses.prayer_id
        and public.is_circle_member(pr.circle_id)
    )
  );

drop policy if exists "Circle members can add their own prayer response" on public.prayer_responses;
create policy "Circle members can add their own prayer response"
  on public.prayer_responses for insert
  to authenticated
  with check (
    auth.uid() = user_id and exists (
      select 1
      from public.prayer_requests pr
      where pr.id = prayer_responses.prayer_id
        and public.is_circle_member(pr.circle_id)
    )
  );

drop policy if exists "Users can remove their own prayer response" on public.prayer_responses;
create policy "Users can remove their own prayer response"
  on public.prayer_responses for delete
  to authenticated
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3. CUSTOM_SCHEDULES TABLE (Strictly Private to auth.uid() = user_id)
-- ----------------------------------------------------------------------------
create table if not exists public.custom_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  rest_days int[] not null default '{0}',
  schedule_items jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.custom_schedules enable row level security;

drop policy if exists "Custom schedules are private to owner (select)" on public.custom_schedules;
create policy "Custom schedules are private to owner (select)"
  on public.custom_schedules for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Custom schedules are private to owner (insert)" on public.custom_schedules;
create policy "Custom schedules are private to owner (insert)"
  on public.custom_schedules for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Custom schedules are private to owner (update)" on public.custom_schedules;
create policy "Custom schedules are private to owner (update)"
  on public.custom_schedules for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Custom schedules are private to owner (delete)" on public.custom_schedules;
create policy "Custom schedules are private to owner (delete)"
  on public.custom_schedules for delete
  to authenticated
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4. ENABLE SUPABASE REALTIME FOR PRAYER_REQUESTS & PRAYER_RESPONSES
-- ----------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE prayer_requests, prayer_responses;
