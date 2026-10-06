create or replace function public.require_user_can(p_user_id uuid, p_action text)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_status text;
  v_reason text;
  v_action_name text;
begin
  if p_user_id is null then
    raise exception 'Please sign in to continue.';
  end if;

  if public.is_admin() then
    return true;
  end if;

  if p_user_id <> (select auth.uid()) then
    raise exception 'This action is not available for your account.';
  end if;

  if public.user_can(p_user_id, p_action) then
    return true;
  end if;

  select moderation.status, moderation.reason
    into v_status, v_reason
  from public.user_moderation as moderation
  where moderation.user_id = p_user_id
    and (moderation.expires_at is null or moderation.expires_at > now())
  limit 1;

  v_action_name := case p_action
    when 'posting' then 'posting'
    when 'commenting' then 'commenting'
    when 'appreciating' then 'appreciating'
    when 'messaging' then 'messaging'
    when 'friend_requests' then 'sending friend requests'
    when 'calls' then 'placing calls'
    else 'performing this action'
  end;

  if v_status = 'banned' then
    if coalesce(v_reason, '') <> '' then
      raise exception 'Your account is banned. %', v_reason;
    end if;
    raise exception 'Your account is banned and cannot %.', v_action_name;
  end if;

  if v_status = 'suspended' then
    if coalesce(v_reason, '') <> '' then
      raise exception 'Your account is suspended. %', v_reason;
    end if;
    raise exception 'Your account is suspended and cannot %.', v_action_name;
  end if;

  if v_status = 'restricted' then
    if coalesce(v_reason, '') <> '' then
      raise exception 'Your account is restricted from %. %', v_action_name, v_reason;
    end if;
    raise exception 'Your account is restricted from %.', v_action_name;
  end if;

  raise exception 'This action is unavailable for your account.';
end;
$$;
revoke all on function public.require_user_can(uuid, text) from public;
grant execute on function public.require_user_can(uuid, text) to authenticated;

drop policy if exists "Members can create their own posts" on public.posts;
create policy "Members can create their own posts"
  on public.posts for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and public.require_user_can((select auth.uid()), 'posting')
  );

drop policy if exists "Members can upload post media to their own folder" on storage.objects;
create policy "Members can upload post media to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.require_user_can((select auth.uid()), 'posting')
  );

drop policy if exists "Members can comment on public posts" on public.comments;
create policy "Members can comment on public posts"
  on public.comments for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and public.require_user_can((select auth.uid()), 'commenting')
    and exists (select 1 from public.posts where posts.id = comments.post_id and posts.visibility = 'public')
    and public.comment_parent_matches_post(post_id, parent_comment_id)
  );

drop policy if exists "Friends can comment on friends-only posts" on public.comments;
create policy "Friends can comment on friends-only posts"
  on public.comments for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and public.require_user_can((select auth.uid()), 'commenting')
    and exists (
      select 1 from public.posts
      where posts.id = comments.post_id and posts.visibility = 'friends'
        and exists (
          select 1 from public.friends
          where (friends.user_one = (select auth.uid()) and friends.user_two = posts.author_id)
             or (friends.user_two = (select auth.uid()) and friends.user_one = posts.author_id)
        )
    )
    and public.comment_parent_matches_post(post_id, parent_comment_id)
  );

drop policy if exists "Members can like public posts" on public.likes;
create policy "Members can like public posts"
  on public.likes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.require_user_can((select auth.uid()), 'appreciating')
    and exists (select 1 from public.posts where posts.id = likes.post_id and posts.visibility = 'public')
  );

drop policy if exists "Members can like friends-only posts" on public.likes;
create policy "Members can like friends-only posts"
  on public.likes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.require_user_can((select auth.uid()), 'appreciating')
    and exists (
      select 1 from public.posts
      where posts.id = likes.post_id and posts.visibility = 'friends'
        and exists (
          select 1 from public.friends
          where (friends.user_one = (select auth.uid()) and friends.user_two = posts.author_id)
             or (friends.user_two = (select auth.uid()) and friends.user_one = posts.author_id)
        )
    )
  );

drop policy if exists "Members can send messages as themselves" on public.messages;
create policy "Members can send messages as themselves"
  on public.messages for insert to authenticated
  with check (
    (select auth.uid()) = sender_id
    and public.require_user_can((select auth.uid()), 'messaging')
    and exists (
      select 1 from public.conversation_members
      where conversation_members.conversation_id = messages.conversation_id
        and conversation_members.user_id = (select auth.uid())
    )
  );

drop policy if exists "Conversation members can send call signals to each other" on public.call_signals;
create policy "Conversation members can send call signals to each other"
  on public.call_signals for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.require_user_can((select auth.uid()), 'calls')
    and exists (
      select 1 from public.conversations
      where conversations.id = call_signals.conversation_id
        and (select auth.uid()) in (conversations.user_one, conversations.user_two)
        and call_signals.recipient_id in (conversations.user_one, conversations.user_two)
    )
  );

create or replace function public.send_friend_request(p_receiver_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
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

revoke all on function public.send_friend_request(uuid) from public;
grant execute on function public.send_friend_request(uuid) to authenticated;