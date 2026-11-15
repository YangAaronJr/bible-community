-- ============================================================================
-- Migration: 004_wave3_docs_push_ocr.sql
-- Description: Wave 3 additive migration:
--   1. circle_docs table + RLS (collaborative sermon notes & study docs)
--   2. push_subscriptions table + RLS (private Web Push endpoints per user)
--   3. Safe SECURITY DEFINER helper to deliver Ring Web Push notifications
--   4. Add nullable ocr_text column to messages for client-side notebook OCR
--   5. Enable Supabase Realtime on circle_docs
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CIRCLE_DOCS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.circle_docs (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  title text not null,
  content text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.circle_docs enable row level security;

drop policy if exists "Circle docs viewable by circle members" on public.circle_docs;
create policy "Circle docs viewable by circle members"
  on public.circle_docs for select
  to authenticated
  using (public.is_circle_member(circle_id));

drop policy if exists "Circle docs insertable by circle members" on public.circle_docs;
create policy "Circle docs insertable by circle members"
  on public.circle_docs for insert
  to authenticated
  with check (public.is_circle_member(circle_id));

drop policy if exists "Circle docs updatable by circle members" on public.circle_docs;
create policy "Circle docs updatable by circle members"
  on public.circle_docs for update
  to authenticated
  using (public.is_circle_member(circle_id))
  with check (public.is_circle_member(circle_id));

drop policy if exists "Circle docs deletable by circle members" on public.circle_docs;
create policy "Circle docs deletable by circle members"
  on public.circle_docs for delete
  to authenticated
  using (public.is_circle_member(circle_id));

-- ----------------------------------------------------------------------------
-- 2. PUSH_SUBSCRIPTIONS TABLE (Strictly Private to auth.uid() = user_id)
-- ----------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Push subscriptions private to owner (select)" on public.push_subscriptions;
create policy "Push subscriptions private to owner (select)"
  on public.push_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Push subscriptions private to owner (insert)" on public.push_subscriptions;
create policy "Push subscriptions private to owner (insert)"
  on public.push_subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Push subscriptions private to owner (update)" on public.push_subscriptions;
create policy "Push subscriptions private to owner (update)"
  on public.push_subscriptions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Push subscriptions private to owner (delete)" on public.push_subscriptions;
create policy "Push subscriptions private to owner (delete)"
  on public.push_subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);

-- Security definer helper so /api/rings/notify can fetch a fellow circle
-- member's push endpoints without exposing push_subscriptions via general SELECT.
create or replace function public.get_ring_push_subscriptions(
  p_circle_id uuid,
  p_recipient_id uuid
)
returns table (
  endpoint text,
  p256dh text,
  auth text
)
language sql
security definer
set search_path = public
stable
as $$
  select ps.endpoint, ps.p256dh, ps.auth
  from public.push_subscriptions ps
  where ps.user_id = p_recipient_id
    and auth.uid() is not null
    and public.is_circle_member(p_circle_id)
    and exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = p_circle_id
        and cm.user_id = p_recipient_id
    );
$$;

-- ----------------------------------------------------------------------------
-- 3. ADD OCR_TEXT COLUMN TO MESSAGES
-- ----------------------------------------------------------------------------
alter table public.messages
  add column if not exists ocr_text text;

-- ----------------------------------------------------------------------------
-- 4. ENABLE SUPABASE REALTIME FOR CIRCLE_DOCS
-- ----------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE circle_docs;
