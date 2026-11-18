-- ============================================================================
-- Migration: 009_read_states_and_chat_prayers.sql
-- Description: Batch 1 additive migration (Refs #3, #6):
--   1. Cross-device read states table (public.user_read_states) + RLS + Realtime
--   2. Nullable prayer_request_id on public.messages + index
--   3. Unified in-chat prayer responses (public.message_prayer_responses) + RLS + Realtime
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. USER_READ_STATES TABLE (Cross-device Circle & DM unread sync)
-- ----------------------------------------------------------------------------
create table if not exists public.user_read_states (
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope_type text not null check (scope_type in ('circle', 'dm')),
  scope_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, scope_type, scope_id)
);

alter table public.user_read_states enable row level security;

drop policy if exists "Read states are private to owner (select)" on public.user_read_states;
create policy "Read states are private to owner (select)"
  on public.user_read_states for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Read states are private to owner (insert)" on public.user_read_states;
create policy "Read states are private to owner (insert)"
  on public.user_read_states for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Read states are private to owner (update)" on public.user_read_states;
create policy "Read states are private to owner (update)"
  on public.user_read_states for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Read states are private to owner (delete)" on public.user_read_states;
create policy "Read states are private to owner (delete)"
  on public.user_read_states for delete
  to authenticated
  using (auth.uid() = user_id);

alter publication supabase_realtime add table public.user_read_states;

-- ----------------------------------------------------------------------------
-- 2. PRAYER_REQUEST_ID LINK ON MESSAGES
-- ----------------------------------------------------------------------------
alter table public.messages
  add column if not exists prayer_request_id uuid references public.prayer_requests(id) on delete set null;

create index if not exists messages_prayer_request_id_idx
  on public.messages (prayer_request_id);

-- ----------------------------------------------------------------------------
-- 3. MESSAGE_PRAYER_RESPONSES TABLE (Unified in-chat [Prayer] persistence)
-- ----------------------------------------------------------------------------
create table if not exists public.message_prayer_responses (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_prayer_responses enable row level security;

drop policy if exists "Message prayer responses readable by authorized message readers" on public.message_prayer_responses;
create policy "Message prayer responses readable by authorized message readers"
  on public.message_prayer_responses for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_prayer_responses.message_id
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
  );

drop policy if exists "Authorized message readers can add their own prayer response" on public.message_prayer_responses;
create policy "Authorized message readers can add their own prayer response"
  on public.message_prayer_responses for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.messages m
      where m.id = message_prayer_responses.message_id
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
  );

drop policy if exists "Users can remove their own message prayer response" on public.message_prayer_responses;
create policy "Users can remove their own message prayer response"
  on public.message_prayer_responses for delete
  to authenticated
  using (auth.uid() = user_id);

alter publication supabase_realtime add table public.message_prayer_responses;
