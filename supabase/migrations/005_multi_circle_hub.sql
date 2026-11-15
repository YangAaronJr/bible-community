-- ============================================================================
-- Migration: 005_multi_circle_hub.sql
-- Description: Multi-Circle Hub & Per-Circle Settings additive migration:
--   1. Add nullable avatar_url and shared_plan_id columns to public.circles
--   2. Create public 'circle-avatars' storage bucket & RLS policies
--   3. Update RLS UPDATE policy on public.circles so circle members
--      (is_circle_member(id)) can update name, avatar_url, and shared_plan_id
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ADD AVATAR_URL & SHARED_PLAN_ID TO CIRCLES
-- ----------------------------------------------------------------------------
alter table public.circles
  add column if not exists avatar_url text,
  add column if not exists shared_plan_id text;

-- ----------------------------------------------------------------------------
-- 2. STORAGE BUCKET: circle-avatars
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('circle-avatars', 'circle-avatars', true)
on conflict (id) do nothing;

drop policy if exists "Circle avatars are viewable by everyone" on storage.objects;
create policy "Circle avatars are viewable by everyone"
  on storage.objects for select
  to public
  using (bucket_id = 'circle-avatars');

drop policy if exists "Authenticated users can upload circle avatars" on storage.objects;
create policy "Authenticated users can upload circle avatars"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'circle-avatars');

drop policy if exists "Authenticated users can update circle avatars" on storage.objects;
create policy "Authenticated users can update circle avatars"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'circle-avatars')
  with check (bucket_id = 'circle-avatars');

drop policy if exists "Authenticated users can delete circle avatars" on storage.objects;
create policy "Authenticated users can delete circle avatars"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'circle-avatars');

-- ----------------------------------------------------------------------------
-- 3. CIRCLES RLS UPDATE POLICY FOR CIRCLE MEMBERS
-- ----------------------------------------------------------------------------
drop policy if exists "Circle creators or leaders can update circle" on public.circles;
drop policy if exists "Circle members can update circle" on public.circles;
create policy "Circle members can update circle"
  on public.circles for update
  to authenticated
  using (
    created_by = auth.uid() or public.is_circle_member(id)
  )
  with check (
    created_by = auth.uid() or public.is_circle_member(id)
  );
