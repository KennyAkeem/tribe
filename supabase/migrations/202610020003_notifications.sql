create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  notification_type text not null,
  entity_id uuid not null,
  post_id uuid,
  conversation_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_type check (notification_type in ('friend_request', 'friend_accepted', 'message', 'like', 'comment'))
);

create index notifications_recipient_created_idxcool
  on public.notifications (recipient_id, created_at desc);
create index notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

create policy "Members can view their own notifications"
  on public.notifications for select to authenticated
  using ((select auth.uid()) = recipient_id);

create policy "Members can mark their own notifications as read"
  on public.notifications for update to authenticated
  using ((select auth.uid()) = recipient_id)
  with check ((select auth.uid()) = recipient_id);

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create function public.notify_friend_request_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    insert into public.notifications (recipient_id, actor_id, notification_type, entity_id)
    values (new.receiver_id, new.sender_id, 'friend_request', new.id);
  end if;
  return new;
end;
$$;

create trigger on_friend_request_created
  after insert on public.friend_requests
  for each row execute procedure public.notify_friend_request_created();

create function public.notify_friend_request_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and new.status = 'accepted' then
    insert into public.notifications (recipient_id, actor_id, notification_type, entity_id)
    values (new.sender_id, new.receiver_id, 'friend_accepted', new.id);
  end if;
  return new;
end;
$$;

create trigger on_friend_request_accepted
  after update of status on public.friend_requests
  for each row execute procedure public.notify_friend_request_accepted();

create function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, actor_id, notification_type, entity_id, conversation_id)
  select conversation_members.user_id, new.sender_id, 'message', new.id, new.conversation_id
  from public.conversation_members
  where conversation_members.conversation_id = new.conversation_id
    and conversation_members.user_id <> new.sender_id;
  return new;
end;
$$;

create trigger on_message_notification_created
  after insert on public.messages
  for each row execute procedure public.notify_new_message();

create function public.notify_new_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, actor_id, notification_type, entity_id, post_id)
  select posts.author_id, new.user_id, 'like', new.post_id, new.post_id
  from public.posts
  where posts.id = new.post_id
    and posts.author_id <> new.user_id;
  return new;
end;
$$;

create trigger on_like_notification_created
  after insert on public.likes
  for each row execute procedure public.notify_new_like();

create function public.notify_new_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_id uuid;
begin
  select coalesce(parent.author_id, posts.author_id)
    into v_recipient_id
  from public.posts
  left join public.comments as parent on parent.id = new.parent_comment_id
  where posts.id = new.post_id;

  if v_recipient_id is not null and v_recipient_id <> new.author_id then
    insert into public.notifications (recipient_id, actor_id, notification_type, entity_id, post_id)
    values (v_recipient_id, new.author_id, 'comment', new.id, new.post_id);
  end if;
  return new;
end;
$$;

create trigger on_comment_notification_created
  after insert on public.comments
  for each row execute procedure public.notify_new_comment();

alter publication supabase_realtime add table public.notifications;
