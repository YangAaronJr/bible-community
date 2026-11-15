-- ============================================================================
-- Migration: 002_wave1_realtime_and_rings.sql
-- Description: Wave 1 additive migration:
--   1. Update rings cooldown trigger from 24 hours to 10 minutes
--   2. Create public 'avatars' storage bucket & RLS policies
--   3. Allow members to toggle their own optional Leader/Pastor role badge
--   4. Enable Supabase Realtime on messages and rings
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. UPDATE RINGS COOLDOWN TO 10 MINUTES
-- ----------------------------------------------------------------------------
create or replace function public.check_ring_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.rings
    where circle_id = NEW.circle_id
      and sender_id = NEW.sender_id
      and recipient_id = NEW.recipient_id
      and created_at > (now() - interval '10 minutes')
  ) then
    raise exception 'A ring nudge was already sent to this member within the last 10 minutes. Grace gives room to breathe.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists enforce_ring_cooldown on public.rings;
create trigger enforce_ring_cooldown
  before insert on public.rings
  for each row
  execute function public.check_ring_cooldown();

-- Allow members to update their own optional Leader/Pastor role in circle_members
drop policy if exists "Members can update their own role if leader or creator updates" on public.circle_members;
create policy "Members can update their own role if leader or creator updates"
  on public.circle_members for update
  to authenticated
  using (
    user_id = auth.uid() or exists (
      select 1 from public.circles
      where id = circle_id and created_by = auth.uid()
    )
  )
  with check (
    user_id = auth.uid() or exists (
      select 1 from public.circles
      where id = circle_id and created_by = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 2. STORAGE BUCKET: avatars (Public Read, Authenticated Self Upload/Update)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Avatars are publicly viewable" on storage.objects;
create policy "Avatars are publicly viewable"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "Authenticated users can upload their own avatar" on storage.objects;
create policy "Authenticated users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars' and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Authenticated users can update their own avatar" on storage.objects;
create policy "Authenticated users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars' and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Authenticated users can delete their own avatar" on storage.objects;
create policy "Authenticated users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars' and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- ----------------------------------------------------------------------------
-- 3. ENABLE SUPABASE REALTIME FOR MESSAGES & RINGS
-- ----------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE messages, rings;
