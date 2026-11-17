-- ============================================================================
-- Migration: 008_storage_privacy_and_push_hygiene.sql
-- Description:
--   1. Scope circle-avatars INSERT/UPDATE/DELETE storage policies to circle members
--   2. Make notebook-uploads private and scope SELECT access to owner or
--      authorized message recipients
--   3. Move friend_code out of public.profiles into private user_friend_codes
--      with get_my_friend_code(), updated handle_new_user(), and updated
--      send_friend_request_by_code()
--   4. Add prune_stale_push_subscriptions() RPC for 410/404 Web Push cleanup
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RESTRICT circle-avatars STORAGE RLS TO CIRCLE MEMBERS
-- ----------------------------------------------------------------------------
drop policy if exists "Authenticated users can upload circle avatars" on storage.objects;
drop policy if exists "Circle members can upload circle avatars" on storage.objects;
create policy "Circle members can upload circle avatars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'circle-avatars'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_circle_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

drop policy if exists "Authenticated users can update circle avatars" on storage.objects;
drop policy if exists "Circle members can update circle avatars" on storage.objects;
create policy "Circle members can update circle avatars"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'circle-avatars'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_circle_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  )
  with check (
    bucket_id = 'circle-avatars'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_circle_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

drop policy if exists "Authenticated users can delete circle avatars" on storage.objects;
drop policy if exists "Circle members can delete circle avatars" on storage.objects;
create policy "Circle members can delete circle avatars"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'circle-avatars'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_circle_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

-- ----------------------------------------------------------------------------
-- 2. MAKE notebook-uploads PRIVATE WITH SCOPED STORAGE SELECT ACCESS
-- ----------------------------------------------------------------------------
update storage.buckets
set public = false
where id = 'notebook-uploads';

create index if not exists messages_image_url_idx
  on public.messages (image_url)
  where image_url is not null;

drop policy if exists "Authenticated users can upload notebook photos" on storage.objects;
create policy "Authenticated users can upload notebook photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'notebook-uploads'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Notebook photos are readable by authenticated users" on storage.objects;
drop policy if exists "Notebook photos are readable by owner or authorized message recipients" on storage.objects;
create policy "Notebook photos are readable by owner or authorized message recipients"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'notebook-uploads'
    and (
      (auth.uid())::text = (storage.foldername(name))[1]
      or exists (
        select 1
        from public.messages m
        where (
          m.image_url = storage.objects.name
          or split_part(split_part(m.image_url, '/notebook-uploads/', 2), '?', 1) = storage.objects.name
        )
        and (
          (
            m.circle_id is not null
            and public.is_circle_member(m.circle_id)
            and (m.recipient_id is null or auth.uid() in (m.sender_id, m.recipient_id))
          )
          or (
            m.friendship_id is not null
            and exists (
              select 1
              from public.friendships f
              where f.id = m.friendship_id
                and f.status = 'accepted'
                and auth.uid() in (f.requester_id, f.addressee_id)
            )
          )
        )
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 3. MOVE friend_code OUT OF public.profiles INTO PRIVATE user_friend_codes
-- ----------------------------------------------------------------------------
create table if not exists public.user_friend_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  friend_code text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  created_at timestamptz not null default now()
);

alter table public.user_friend_codes enable row level security;

drop policy if exists "Friend codes are private to owner (select)" on public.user_friend_codes;
create policy "Friend codes are private to owner (select)"
  on public.user_friend_codes for select
  to authenticated
  using (auth.uid() = user_id);

-- Migrate existing profiles.friend_code values before dropping column from profiles
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'friend_code'
  ) then
    insert into public.user_friend_codes (user_id, friend_code)
    select
      p.id,
      coalesce(
        nullif(upper(trim(p.friend_code)), ''),
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
      )
    from public.profiles p
    on conflict (user_id) do nothing;

    alter table public.profiles drop column friend_code;
  else
    insert into public.user_friend_codes (user_id)
    select p.id
    from public.profiles p
    on conflict (user_id) do nothing;
  end if;
end $$;

-- Update signup trigger so every new user gets a private friend_code row
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_name text;
  fallback_name text;
begin
  raw_name := new.raw_user_meta_data->>'display_name';
  if raw_name is null or trim(raw_name) = '' then
    fallback_name := split_part(new.email, '@', 1);
  else
    fallback_name := trim(raw_name);
  end if;

  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(nullif(fallback_name, ''), 'Fellow Reader'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    display_name = coalesce(excluded.display_name, profiles.display_name),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url);

  insert into public.user_friend_codes (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- RPC for the signed-in user to read (or lazily provision) their own friend_code
create or replace function public.get_my_friend_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
  my_code text;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'Unauthorized';
  end if;

  select friend_code
  into my_code
  from public.user_friend_codes
  where user_id = caller_id;

  if not found then
    insert into public.user_friend_codes (user_id)
    values (caller_id)
    on conflict (user_id) do update set user_id = excluded.user_id
    returning friend_code into my_code;
  end if;

  return my_code;
end;
$$;

-- Update send_friend_request_by_code to read from user_friend_codes (strict code match)
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
    raise exception 'Please enter a friend code.';
  end if;

  select p.id, p.display_name, ufc.friend_code
  into target_profile
  from public.user_friend_codes ufc
  join public.profiles p on p.id = ufc.user_id
  where upper(trim(ufc.friend_code)) = upper(normalized)
  limit 1;

  if not found then
    raise exception 'No member found with friend code "%".', upper(normalized);
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
-- 4. PRUNE STALE WEB PUSH SUBSCRIPTIONS (410 / 404)
-- ----------------------------------------------------------------------------
create or replace function public.prune_stale_push_subscriptions(
  p_recipient_id uuid,
  p_endpoints text[]
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count int := 0;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if p_recipient_id is null or p_endpoints is null or cardinality(p_endpoints) = 0 then
    return 0;
  end if;

  if auth.uid() <> p_recipient_id
     and not public.are_friends(p_recipient_id)
     and not exists (
       select 1
       from public.circle_members cm1
       join public.circle_members cm2 on cm1.circle_id = cm2.circle_id
       where cm1.user_id = auth.uid()
         and cm2.user_id = p_recipient_id
     ) then
    raise exception 'Forbidden';
  end if;

  delete from public.push_subscriptions
  where user_id = p_recipient_id
    and endpoint = any(p_endpoints);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
