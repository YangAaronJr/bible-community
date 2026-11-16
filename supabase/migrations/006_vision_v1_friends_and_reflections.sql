-- ============================================================================
-- Migration: 006_vision_v1_friends_and_reflections.sql
-- Description: Product Vision v1.0 additive migration:
--   1. Friend codes on public.profiles + public.friendships table & RLS
--   2. SECURITY DEFINER RPC send_friend_request_by_code & helper are_friends
--   3. 1-on-1 Friend DMs via nullable circle_id + friendship_id on messages
--   4. Friend Rings via nullable circle_id on rings + updated push RPC
--   5. Targeted Reflections & 3-day visibility window on verse_notes
--   6. Enable Supabase Realtime on friendships
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FRIEND CODES ON PROFILES & FRIENDSHIPS TABLE
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists friend_code text unique
  default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

update public.profiles
set friend_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
where friend_code is null;

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

-- Prevent duplicate reverse pairs (e.g. A->B and B->A at the same time)
create unique index if not exists friendships_pair_unique_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table public.friendships enable row level security;

drop policy if exists "Friendships viewable by participants" on public.friendships;
create policy "Friendships viewable by participants"
  on public.friendships for select
  to authenticated
  using (auth.uid() in (requester_id, addressee_id));

drop policy if exists "Users can send friend requests" on public.friendships;
create policy "Users can send friend requests"
  on public.friendships for insert
  to authenticated
  with check (
    auth.uid() = requester_id
    and requester_id <> addressee_id
  );

drop policy if exists "Addressee can accept friend request" on public.friendships;
create policy "Addressee can accept friend request"
  on public.friendships for update
  to authenticated
  using (auth.uid() = addressee_id)
  with check (
    auth.uid() = addressee_id
    and status = 'accepted'
  );

drop policy if exists "Participants can remove or decline friendship" on public.friendships;
create policy "Participants can remove or decline friendship"
  on public.friendships for delete
  to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- Helper: check mutual accepted friendship with current user
create or replace function public.are_friends(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.friendships
    where status = 'accepted'
      and (
        (requester_id = auth.uid() and addressee_id = target_user_id)
        or (requester_id = target_user_id and addressee_id = auth.uid())
      )
  );
$$;

-- RPC: look up user by friend_code (or exact display_name) and create pending request
create or replace function public.send_friend_request_by_code(code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
  normalized text;
  target_profile record;
  existing_row record;
  new_friendship_id uuid;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'Unauthorized: You must be signed in to send a friend request.';
  end if;

  normalized := trim(coalesce(code, ''));
  if normalized = '' then
    raise exception 'Please enter a friend code or display name.';
  end if;

  select id, display_name, friend_code
  into target_profile
  from public.profiles
  where upper(trim(friend_code)) = upper(normalized)
     or display_name = normalized
  order by (upper(trim(friend_code)) = upper(normalized)) desc, created_at asc
  limit 1;

  if not found then
    raise exception 'No member found matching "%".', normalized;
  end if;

  if target_profile.id = caller_id then
    raise exception 'You cannot send a friend request to yourself.';
  end if;

  select id, requester_id, addressee_id, status
  into existing_row
  from public.friendships
  where (requester_id = caller_id and addressee_id = target_profile.id)
     or (requester_id = target_profile.id and addressee_id = caller_id)
  limit 1;

  if found then
    return json_build_object(
      'friendship_id', existing_row.id,
      'target_user_id', target_profile.id,
      'display_name', target_profile.display_name,
      'status', existing_row.status,
      'direction', case when existing_row.requester_id = caller_id then 'outgoing' else 'incoming' end,
      'already_exists', true
    );
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (caller_id, target_profile.id, 'pending')
  returning id into new_friendship_id;

  return json_build_object(
    'friendship_id', new_friendship_id,
    'target_user_id', target_profile.id,
    'display_name', target_profile.display_name,
    'status', 'pending',
    'direction', 'outgoing',
    'already_exists', false
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. 1-ON-1 FRIEND DMS ON MESSAGES
-- ----------------------------------------------------------------------------
alter table public.messages
  alter column circle_id drop not null;

alter table public.messages
  add column if not exists friendship_id uuid references public.friendships(id) on delete cascade;

alter table public.messages
  drop constraint if exists messages_target_check;

alter table public.messages
  add constraint messages_target_check
  check ((circle_id is not null) <> (friendship_id is not null));

create index if not exists messages_friendship_created_idx
  on public.messages (friendship_id, created_at);

drop policy if exists "Messages read policy" on public.messages;
create policy "Messages read policy"
  on public.messages for select
  to authenticated
  using (
    (
      circle_id is not null
      and public.is_circle_member(circle_id)
      and (recipient_id is null or auth.uid() in (sender_id, recipient_id))
    )
    or (
      friendship_id is not null
      and exists (
        select 1
        from public.friendships f
        where f.id = messages.friendship_id
          and f.status = 'accepted'
          and auth.uid() in (f.requester_id, f.addressee_id)
      )
    )
  );

drop policy if exists "Messages insert policy" on public.messages;
create policy "Messages insert policy"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and (
      (circle_id is not null and public.is_circle_member(circle_id))
      or (
        friendship_id is not null
        and exists (
          select 1
          from public.friendships f
          where f.id = messages.friendship_id
            and f.status = 'accepted'
            and auth.uid() in (f.requester_id, f.addressee_id)
        )
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 3. FRIEND RINGS (ALLOW NULLABLE CIRCLE_ID)
-- ----------------------------------------------------------------------------
alter table public.rings
  alter column circle_id drop not null;

drop policy if exists "Rings read policy" on public.rings;
create policy "Rings read policy"
  on public.rings for select
  to authenticated
  using (
    auth.uid() in (sender_id, recipient_id)
    and (
      (circle_id is not null and public.is_circle_member(circle_id))
      or (
        circle_id is null
        and (
          public.are_friends(sender_id)
          or public.are_friends(recipient_id)
        )
      )
    )
  );

drop policy if exists "Rings insert policy" on public.rings;
create policy "Rings insert policy"
  on public.rings for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and sender_id <> recipient_id
    and (
      (circle_id is not null and public.is_circle_member(circle_id))
      or (circle_id is null and public.are_friends(recipient_id))
    )
  );

-- Handle null circle_id safely in 10-minute cooldown trigger
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
    where circle_id is not distinct from NEW.circle_id
      and sender_id = NEW.sender_id
      and recipient_id = NEW.recipient_id
      and created_at > (now() - interval '10 minutes')
  ) then
    raise exception 'A ring nudge was already sent to this member within the last 10 minutes. Grace gives room to breathe.';
  end if;
  return NEW;
end;
$$;

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
    and (
      (
        p_circle_id is not null
        and public.is_circle_member(p_circle_id)
        and exists (
          select 1
          from public.circle_members cm
          where cm.circle_id = p_circle_id
            and cm.user_id = p_recipient_id
        )
      )
      or (
        p_circle_id is null
        and public.are_friends(p_recipient_id)
      )
    );
$$;

-- ----------------------------------------------------------------------------
-- 4. TARGETED REFLECTIONS & 3-DAY WINDOW ON VERSE_NOTES
-- ----------------------------------------------------------------------------
alter table public.verse_notes
  alter column circle_id drop not null;

alter table public.verse_notes
  add column if not exists visibility text not null default 'private'
  check (visibility in ('private', 'friends', 'circles'));

alter table public.verse_notes
  add column if not exists target_circle_ids uuid[] not null default '{}';

-- Preserve legacy circle-scoped notes as targeted to their original circle
update public.verse_notes
set
  visibility = 'circles',
  target_circle_ids = array[circle_id]
where circle_id is not null
  and visibility = 'private'
  and cardinality(target_circle_ids) = 0;

drop policy if exists "Verse notes readable by circle members" on public.verse_notes;
drop policy if exists "Verse notes readable by owner or targeted peers within 72h" on public.verse_notes;
create policy "Verse notes readable by owner or targeted peers within 72h"
  on public.verse_notes for select
  to authenticated
  using (
    auth.uid() = user_id
    or (
      created_at >= (now() - interval '72 hours')
      and (
        (visibility = 'friends' and public.are_friends(user_id))
        or (
          visibility = 'circles'
          and exists (
            select 1
            from unnest(target_circle_ids) as cid
            where public.is_circle_member(cid)
          )
        )
      )
    )
  );

drop policy if exists "Verse notes insertable by circle members" on public.verse_notes;
drop policy if exists "Verse notes insertable by owner" on public.verse_notes;
create policy "Verse notes insertable by owner"
  on public.verse_notes for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5. ENABLE SUPABASE REALTIME FOR FRIENDSHIPS
-- ----------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE friendships;
