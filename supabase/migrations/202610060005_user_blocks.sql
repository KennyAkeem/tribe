create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_distinct_users check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;
create policy "Members can view their own block list"
  on public.user_blocks for select to authenticated
  using ((select auth.uid()) = blocker_id);
grant select on public.user_blocks to authenticated;

create function public.users_are_blocked(p_user_one uuid, p_user_two uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select p_user_one is not null
    and p_user_two is not null
    and p_user_one <> p_user_two
    and (select auth.uid()) in (p_user_one, p_user_two)
    and exists (
      select 1
      from public.user_blocks as block
      where (block.blocker_id = p_user_one and block.blocked_id = p_user_two)
         or (block.blocker_id = p_user_two and block.blocked_id = p_user_one)
    );
$$;
revoke all on function public.users_are_blocked(uuid, uuid) from public;
grant execute on function public.users_are_blocked(uuid, uuid) to authenticated;

create function public.conversation_is_blocked(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.conversations as conversation
    where conversation.id = p_conversation_id
      and (select auth.uid()) in (conversation.user_one, conversation.user_two)
      and public.users_are_blocked(conversation.user_one, conversation.user_two)
  );
$$;
revoke all on function public.conversation_is_blocked(uuid) from public;
grant execute on function public.conversation_is_blocked(uuid) to authenticated;

create function public.get_my_blocked_users()
returns table (
  blocked_id uuid,
  full_name text,
  username text,
  avatar_url text,
  blocked_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select block.blocked_id, profile.full_name, profile.username, profile.avatar_url, block.created_at
  from public.user_blocks as block
  join public.profiles as profile on profile.id = block.blocked_id
  where block.blocker_id = (select auth.uid())
  order by block.created_at desc;
$$;
revoke all on function public.get_my_blocked_users() from public;
grant execute on function public.get_my_blocked_users() to authenticated;

create function public.unfriend_user(p_other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'Sign in to manage your friends'; end if;
  if p_other_user_id is null or p_other_user_id = v_user_id then raise exception 'Choose another member'; end if;

  delete from public.friends
  where user_one = least(v_user_id, p_other_user_id)
    and user_two = greatest(v_user_id, p_other_user_id);

  if not found then raise exception 'This member is not in your friends list'; end if;
end;
$$;
revoke all on function public.unfriend_user(uuid) from public;
grant execute on function public.unfriend_user(uuid) to authenticated;

create function public.block_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_user_one uuid;
  v_user_two uuid;
begin
  if v_user_id is null then raise exception 'Sign in to block a member'; end if;
  if p_blocked_id is null or p_blocked_id = v_user_id then raise exception 'Choose another member to block'; end if;
  if not exists (select 1 from public.profiles where id = p_blocked_id) then raise exception 'That member could not be found'; end if;

  v_user_one := least(v_user_id, p_blocked_id);
  v_user_two := greatest(v_user_id, p_blocked_id);

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_user_id, p_blocked_id)
  on conflict do nothing;

  delete from public.friends
  where user_one = v_user_one and user_two = v_user_two;

  update public.friend_requests
  set status = 'cancelled', updated_at = now()
  where status = 'pending'
    and least(sender_id, receiver_id) = v_user_one
    and greatest(sender_id, receiver_id) = v_user_two;
end;
$$;
revoke all on function public.block_user(uuid) from public;
grant execute on function public.block_user(uuid) to authenticated;

create function public.unblock_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if (select auth.uid()) is null then raise exception 'Sign in to manage your block list'; end if;
  delete from public.user_blocks
  where blocker_id = (select auth.uid()) and blocked_id = p_blocked_id;
  if not found then raise exception 'This member is not in your block list'; end if;
end;
$$;
revoke all on function public.unblock_user(uuid) from public;
grant execute on function public.unblock_user(uuid) to authenticated;

create policy "Blocked members cannot view each other's profiles"
  on public.profiles as restrictive for select to authenticated
  using (
    (select auth.uid()) = id
    or not public.users_are_blocked((select auth.uid()), id)
  );

create policy "Blocked members cannot view each other's posts"
  on public.posts as restrictive for select to authenticated
  using (
    (select public.is_admin())
    or (
      not public.users_are_blocked((select auth.uid()), author_id)
      and (repost_of is null or public.post_repost_source_available(repost_of))
    )
  );

create policy "Blocked members cannot view each other's comments"
  on public.comments as restrictive for select to authenticated
  using (
    (select public.is_admin())
    or (
      not public.users_are_blocked((select auth.uid()), author_id)
      and exists (
        select 1 from public.posts
        where posts.id = comments.post_id
          and not public.users_are_blocked((select auth.uid()), posts.author_id)
      )
    )
  );

create policy "Blocked members cannot view each other's friend requests"
  on public.friend_requests as restrictive for select to authenticated
  using (not public.users_are_blocked((select auth.uid()), sender_id)
    and not public.users_are_blocked((select auth.uid()), receiver_id));

create policy "Blocked members cannot view each other's friendships"
  on public.friends as restrictive for select to authenticated
  using (not public.users_are_blocked((select auth.uid()), user_one)
    and not public.users_are_blocked((select auth.uid()), user_two));

create policy "Blocked members cannot view each other's conversations"
  on public.conversations as restrictive for select to authenticated
  using (not public.users_are_blocked((select auth.uid()), user_one)
    and not public.users_are_blocked((select auth.uid()), user_two));

create policy "Blocked members cannot access conversation messages"
  on public.messages as restrictive for all to authenticated
  using (not public.conversation_is_blocked(conversation_id))
  with check (not public.conversation_is_blocked(conversation_id));

create policy "Blocked members cannot access call signals"
  on public.call_signals as restrictive for all to authenticated
  using (not public.conversation_is_blocked(conversation_id))
  with check (not public.conversation_is_blocked(conversation_id));

create or replace function public.send_friend_request(p_receiver_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_user_one uuid;
  v_user_two uuid;
  v_request_id uuid;
begin
  if v_user_id is null then raise exception 'You must be signed in to send a friend request'; end if;
  if not public.user_can(v_user_id, 'friend_requests') then raise exception 'Your account is restricted from sending friend requests'; end if;
  if p_receiver_id is null or p_receiver_id = v_user_id then raise exception 'Choose another member to send a friend request'; end if;
  if not exists (select 1 from public.profiles where id = p_receiver_id) then raise exception 'That member could not be found'; end if;
  if public.users_are_blocked(v_user_id, p_receiver_id) then raise exception 'You cannot send a request to this member'; end if;

  v_user_one := least(v_user_id, p_receiver_id);
  v_user_two := greatest(v_user_id, p_receiver_id);
  if exists (select 1 from public.friends where user_one = v_user_one and user_two = v_user_two) then raise exception 'You are already friends'; end if;
  if exists (select 1 from public.friend_requests where status = 'pending' and least(sender_id, receiver_id) = v_user_one and greatest(sender_id, receiver_id) = v_user_two) then
    raise exception 'A friend request is already pending between you';
  end if;

  insert into public.friend_requests (sender_id, receiver_id)
  values (v_user_id, p_receiver_id)
  returning id into v_request_id;
  return v_request_id;
end;
$$;

create or replace function public.respond_to_friend_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_request public.friend_requests%rowtype;
begin
  if v_user_id is null then raise exception 'You must be signed in to respond to a friend request'; end if;

  select * into v_request
  from public.friend_requests
  where id = p_request_id
  for update;

  if not found or v_request.receiver_id <> v_user_id or v_request.status <> 'pending' then
    raise exception 'That friend request is no longer available';
  end if;
  if public.users_are_blocked(v_request.sender_id, v_request.receiver_id) then
    raise exception 'You cannot respond to a request from this member';
  end if;

  update public.friend_requests
  set status = case when p_accept then 'accepted' else 'rejected' end,
      updated_at = now()
  where id = p_request_id;

  if p_accept then
    insert into public.friends (user_one, user_two)
    values (least(v_request.sender_id, v_request.receiver_id), greatest(v_request.sender_id, v_request.receiver_id))
    on conflict do nothing;
  end if;
end;
$$;

create or replace function public.create_direct_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_user_one uuid;
  v_user_two uuid;
  v_conversation_id uuid;
begin
  if v_user_id is null then raise exception 'You must be signed in to start a conversation'; end if;
  if p_other_user_id is null or p_other_user_id = v_user_id then raise exception 'Choose another member to start a conversation'; end if;
  if public.users_are_blocked(v_user_id, p_other_user_id) then raise exception 'You cannot message this member'; end if;
  if not exists (select 1 from public.profiles where id = p_other_user_id) then raise exception 'That member could not be found'; end if;

  v_user_one := least(v_user_id, p_other_user_id);
  v_user_two := greatest(v_user_id, p_other_user_id);
  insert into public.conversations (user_one, user_two)
  values (v_user_one, v_user_two)
  on conflict (user_one, user_two) do update set updated_at = public.conversations.updated_at
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conversation_id, v_user_one), (v_conversation_id, v_user_two)
  on conflict do nothing;
  return v_conversation_id;
end;
$$;

create or replace function public.get_friend_suggestions(p_limit integer default 6)
returns table (
  id uuid,
  full_name text,
  username text,
  avatar_url text
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select candidate.id, candidate.full_name, candidate.username, candidate.avatar_url
  from public.profiles as candidate
  where candidate.id <> (select auth.uid())
    and not public.users_are_blocked((select auth.uid()), candidate.id)
    and not exists (
      select 1 from public.friends as friendship
      where friendship.user_one = least((select auth.uid()), candidate.id)
        and friendship.user_two = greatest((select auth.uid()), candidate.id)
    )
    and not exists (
      select 1 from public.friend_requests as request
      where request.status = 'pending'
        and least(request.sender_id, request.receiver_id) = least((select auth.uid()), candidate.id)
        and greatest(request.sender_id, request.receiver_id) = greatest((select auth.uid()), candidate.id)
    )
  order by candidate.created_at desc
  limit greatest(1, least(coalesce(p_limit, 6), 20));
$$;

create or replace function public.get_skill_swap_matches(p_user_id uuid, p_limit integer default 8)
returns table (
  matched_user_id uuid,
  full_name text,
  username text,
  avatar_url text,
  teach_skills text[],
  learn_skills text[],
  can_teach text[],
  wants_to_learn text[],
  match_score integer
)
language sql
security definer
set search_path = ''
set row_security = off
as $$
with current_profile as (
  select public.normalize_skill_list(teach_skills) as teach_skills,
         public.normalize_skill_list(learn_skills) as learn_skills
  from public.profiles
  where id = p_user_id and p_user_id = (select auth.uid())
), match_candidates as (
  select
    p.id as matched_user_id,
    p.full_name,
    p.username,
    p.avatar_url,
    public.normalize_skill_list(p.teach_skills) as teach_skills,
    public.normalize_skill_list(p.learn_skills) as learn_skills,
    array(
      select distinct skill from unnest(public.normalize_skill_list(p.teach_skills)) as skill
      where skill = any (coalesce(cp.learn_skills, array[]::text[]))
    ) as can_teach,
    array(
      select distinct skill from unnest(public.normalize_skill_list(p.learn_skills)) as skill
      where skill = any (coalesce(cp.teach_skills, array[]::text[]))
    ) as wants_to_learn
  from public.profiles as p
  cross join current_profile as cp
  where p.id <> p_user_id
    and not public.users_are_blocked(p_user_id, p.id)
    and (
      p.teach_skills && coalesce(cp.learn_skills, array[]::text[])
      or p.learn_skills && coalesce(cp.teach_skills, array[]::text[])
    )
)
select matched_user_id, full_name, username, avatar_url, teach_skills, learn_skills,
       can_teach, wants_to_learn,
       (cardinality(can_teach) + cardinality(wants_to_learn))::integer as match_score
from match_candidates
where cardinality(can_teach) > 0 or cardinality(wants_to_learn) > 0
order by match_score desc, full_name asc
limit greatest(p_limit, 0);
$$;

create or replace function public.post_repost_source_available(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select p_post_id is null or exists (
    select 1 from public.posts as source
    where source.id = p_post_id
      and source.visibility = 'public'
      and not source.is_hidden
      and not public.users_are_blocked((select auth.uid()), source.author_id)
  );
$$;

create or replace function public.send_post_energy(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_today date := (now() at time zone 'utc')::date;
  v_balance bigint;
  v_accrued_through date;
  v_author_id uuid;
  v_visibility public.post_visibility;
  v_is_hidden boolean;
  v_post_energy bigint;
begin
  if v_user_id is null then raise exception 'Sign in to send energy'; end if;
  perform public.require_user_can(v_user_id, 'appreciating');

  select author_id, visibility, is_hidden into v_author_id, v_visibility, v_is_hidden
  from public.posts where id = p_post_id for update;
  if not found or public.users_are_blocked(v_user_id, v_author_id) then raise exception 'This post is unavailable'; end if;
  if v_author_id = v_user_id then raise exception 'You cannot send energy to your own post'; end if;
  if v_is_hidden or (
    v_visibility = 'friends'
    and not exists (
      select 1 from public.friends
      where (user_one = v_user_id and user_two = v_author_id)
         or (user_two = v_user_id and user_one = v_author_id)
    )
  ) then raise exception 'This post is unavailable'; end if;

  insert into public.energy_balances (user_id, balance, accrued_through)
  values (v_user_id, 100, v_today)
  on conflict (user_id) do nothing;
  select balance, accrued_through into v_balance, v_accrued_through
  from public.energy_balances where user_id = v_user_id for update;
  if v_accrued_through < v_today then v_balance := v_balance + (v_today - v_accrued_through)::bigint * 100; end if;
  if v_balance < 1 then raise exception 'You are out of energy. Chat with someone to earn more.'; end if;

  update public.energy_balances
  set balance = v_balance - 1, accrued_through = v_today
  where user_id = v_user_id;
  update public.posts set energy_total = energy_total + 1
  where id = p_post_id returning energy_total into v_post_energy;
  return jsonb_build_object('balance', v_balance - 1, 'post_energy', v_post_energy);
end;
$$;

create or replace function public.repost_post(p_post_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_source_id uuid;
  v_original_author_id uuid;
  v_post_visibility public.post_visibility;
  v_post_hidden boolean;
  v_repost_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to repost posts'; end if;
  if not public.user_can((select auth.uid()), 'posting') then raise exception 'Posting is restricted for this account'; end if;
  select visibility, is_hidden, coalesce(repost_of, id)
    into v_post_visibility, v_post_hidden, v_source_id
  from public.posts where id = p_post_id;
  if not found then raise exception 'Post not found'; end if;
  if v_post_visibility <> 'public' or v_post_hidden then raise exception 'Only public posts can be reposted'; end if;

  select author_id into v_original_author_id
  from public.posts
  where id = v_source_id and visibility = 'public' and not is_hidden;
  if not found then raise exception 'This post is no longer available to repost'; end if;
  if v_original_author_id = (select auth.uid()) then raise exception 'You cannot repost your own post'; end if;
  if public.users_are_blocked((select auth.uid()), v_original_author_id) then raise exception 'This post is unavailable'; end if;

  insert into public.posts (author_id, content, visibility, repost_of)
  values ((select auth.uid()), '', 'public', v_source_id)
  returning id into v_repost_id;
  return v_repost_id;
end;
$$;

alter publication supabase_realtime add table public.user_blocks;
