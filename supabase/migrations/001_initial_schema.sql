-- ============================================================================
-- Migration: 001_initial_schema.sql
-- Description: Core tables, RLS policies, security definer functions, triggers,
--              and storage bucket for Bible Community (Grace-Centered Fellowship)
-- ============================================================================

-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. PROFILES TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Trigger to create profile automatically when new user signs up in auth.users
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

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. CIRCLES TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  max_members int not null default 12 check (max_members <= 12 and max_members >= 2),
  created_at timestamptz not null default now()
);

alter table public.circles enable row level security;

-- ----------------------------------------------------------------------------
-- 3. CIRCLE_MEMBERS TABLE & ANTI-RECURSION HELPER
-- ----------------------------------------------------------------------------
create table if not exists public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'leader')),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

alter table public.circle_members enable row level security;

-- Anti-recursion membership check function (SECURITY DEFINER)
create or replace function public.is_circle_member(target_circle_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.circle_members
    where circle_id = target_circle_id
      and user_id = auth.uid()
  );
$$;

-- Circles RLS Policies
create policy "Users can view circles they are members of or created"
  on public.circles for select
  to authenticated
  using (
    created_by = auth.uid() or public.is_circle_member(id)
  );

create policy "Authenticated users can create circles"
  on public.circles for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Circle creators or leaders can update circle"
  on public.circles for update
  to authenticated
  using (
    created_by = auth.uid() or exists (
      select 1 from public.circle_members
      where circle_id = circles.id
        and user_id = auth.uid()
        and role = 'leader'
    )
  );

-- Circle Members RLS Policies
create policy "Members can view membership of their circles"
  on public.circle_members for select
  to authenticated
  using (
    user_id = auth.uid() or public.is_circle_member(circle_id)
  );

create policy "Users can insert themselves as member or circle creator adds them"
  on public.circle_members for insert
  to authenticated
  with check (
    user_id = auth.uid() or exists (
      select 1 from public.circles
      where id = circle_id and created_by = auth.uid()
    )
  );

create policy "Members can update their own role if leader or creator updates"
  on public.circle_members for update
  to authenticated
  using (
    exists (
      select 1 from public.circles
      where id = circle_id and created_by = auth.uid()
    )
  );

create policy "Members can leave or creator can remove"
  on public.circle_members for delete
  to authenticated
  using (
    user_id = auth.uid() or exists (
      select 1 from public.circles
      where id = circle_id and created_by = auth.uid()
    )
  );

-- Join Circle by Code RPC Function (SECURITY DEFINER)
create or replace function public.join_circle_by_code(code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  target_circle record;
  current_count int;
  caller_id uuid;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'Unauthorized: You must be signed in to join a circle.';
  end if;

  select id, name, max_members
  into target_circle
  from public.circles
  where upper(trim(invite_code)) = upper(trim(code));

  if not found then
    raise exception 'Circle not found with invite code "%"', code;
  end if;

  -- Check if already member
  if exists (
    select 1 from public.circle_members
    where circle_id = target_circle.id and user_id = caller_id
  ) then
    return json_build_object(
      'circle_id', target_circle.id,
      'name', target_circle.name,
      'already_member', true
    );
  end if;

  -- Check max members constraint (strictly <= 12)
  select count(*)
  into current_count
  from public.circle_members
  where circle_id = target_circle.id;

  if current_count >= coalesce(target_circle.max_members, 12) then
    raise exception 'This circle has reached its maximum capacity of % members.', coalesce(target_circle.max_members, 12);
  end if;

  insert into public.circle_members (circle_id, user_id, role)
  values (target_circle.id, caller_id, 'member');

  return json_build_object(
    'circle_id', target_circle.id,
    'name', target_circle.name,
    'already_member', false
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. READING_PROGRESS TABLE (Strictly Private to auth.uid())
-- ----------------------------------------------------------------------------
create table if not exists public.reading_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  book text not null,
  chapter int not null check (chapter > 0),
  read_in_physical_bible boolean not null default false,
  completed_at timestamptz not null default now(),
  unique (user_id, book, chapter)
);

alter table public.reading_progress enable row level security;

create policy "Reading progress is strictly private to owner (select)"
  on public.reading_progress for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Reading progress is strictly private to owner (insert)"
  on public.reading_progress for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Reading progress is strictly private to owner (update)"
  on public.reading_progress for update
  to authenticated
  using (auth.uid() = user_id);

create policy "Reading progress is strictly private to owner (delete)"
  on public.reading_progress for delete
  to authenticated
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5. VERSE_NOTES TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.verse_notes (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  book text not null,
  chapter int not null,
  verse_start int not null,
  verse_end int not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.verse_notes enable row level security;

create policy "Verse notes readable by circle members"
  on public.verse_notes for select
  to authenticated
  using (public.is_circle_member(circle_id));

create policy "Verse notes insertable by circle members"
  on public.verse_notes for insert
  to authenticated
  with check (
    auth.uid() = user_id and public.is_circle_member(circle_id)
  );

create policy "Users can update their own verse notes"
  on public.verse_notes for update
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete their own verse notes"
  on public.verse_notes for delete
  to authenticated
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 6. MESSAGES TABLE (Community Feed, Notebook Photos, Threaded Replies & 1-on-1 DMs)
-- ----------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete set null,
  parent_id uuid references public.messages(id) on delete cascade,
  content text not null,
  image_url text,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

-- Main circle feed (recipient_id IS NULL) readable by circle members
-- 1-on-1 DMs (recipient_id IS NOT NULL) readable ONLY by sender or recipient
create policy "Messages read policy"
  on public.messages for select
  to authenticated
  using (
    public.is_circle_member(circle_id) and (
      recipient_id is null or auth.uid() in (sender_id, recipient_id)
    )
  );

create policy "Messages insert policy"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id and public.is_circle_member(circle_id)
  );

create policy "Users can update their own messages"
  on public.messages for update
  to authenticated
  using (auth.uid() = sender_id);

create policy "Users can delete their own messages"
  on public.messages for delete
  to authenticated
  using (auth.uid() = sender_id);

-- ----------------------------------------------------------------------------
-- 7. RINGS TABLE (24-Hour Cooldown Encouragement Nudges)
-- ----------------------------------------------------------------------------
create table if not exists public.rings (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message text not null default 'Praying for your time in the Word today',
  created_at timestamptz not null default now()
);

alter table public.rings enable row level security;

create policy "Rings read policy"
  on public.rings for select
  to authenticated
  using (
    public.is_circle_member(circle_id) and auth.uid() in (sender_id, recipient_id)
  );

create policy "Rings insert policy"
  on public.rings for insert
  to authenticated
  with check (
    auth.uid() = sender_id and
    sender_id <> recipient_id and
    public.is_circle_member(circle_id)
  );

-- Enforce 24-hour cooldown trigger per (circle_id, sender_id, recipient_id)
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
      and created_at > (now() - interval '24 hours')
  ) then
    raise exception 'A ring nudge was already sent to this member within the last 24 hours. Grace gives room to breathe.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists enforce_ring_cooldown on public.rings;
create trigger enforce_ring_cooldown
  before insert on public.rings
  for each row
  execute function public.check_ring_cooldown();

-- ----------------------------------------------------------------------------
-- 8. STORAGE BUCKET: notebook-uploads
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('notebook-uploads', 'notebook-uploads', true)
on conflict (id) do nothing;

create policy "Notebook photos are readable by authenticated users"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'notebook-uploads');

create policy "Authenticated users can upload notebook photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'notebook-uploads');

create policy "Users can update their uploaded photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'notebook-uploads' and (auth.uid())::text = (storage.foldername(name))[1]);

create policy "Users can delete their uploaded photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'notebook-uploads' and (auth.uid())::text = (storage.foldername(name))[1]);
