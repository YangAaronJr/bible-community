-- ============================================================================
-- Migration: 007_revisions_friend_code_and_sabbath.sql
-- Description:
--   1. Restrict send_friend_request_by_code to match strictly on friend_code
--      (removes display_name fallback so non-unique names cannot match wrong user)
--   2. Change default Sabbath rest_days on custom_schedules from '{0}' to '{}'
-- ============================================================================

-- 1. Match friend requests strictly by Friend Code
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

  select id, display_name, friend_code
  into target_profile
  from public.profiles
  where upper(trim(friend_code)) = upper(normalized)
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

-- 2. Default Sabbath rest_days to empty array '{}' instead of Sunday '{0}'
alter table public.custom_schedules
  alter column rest_days set default '{}';
