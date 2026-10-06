create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_request_distinct_members check (sender_id <> receiver_id),
  constraint friend_request_status check (status in ('pending', 'accepted', 'rejected', 'cancelled'))
);

create table public.friends (
  user_one uuid not null references public.profiles (id) on delete cascade,
  user_two uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_one, user_two),
  constraint friends_sorted_members check (user_one < user_two)
);

create unique index friend_requests_one_pending_per_pair_idx
  on public.friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status = 'pending';
create index friend_requests_receiver_status_created_idx
  on public.friend_requests (receiver_id, status, created_at desc);
create index friend_requests_sender_status_created_idx
  on public.friend_requests (sender_id, status, created_at desc);

alter table public.friend_requests enable row level security;
alter table public.friends enable row level security;

create policy "Members can view requests involving themselves"
  on public.friend_requests for select to authenticated
  using ((select auth.uid()) in (sender_id, receiver_id));

create policy "Members can view their friendships"
  on public.friends for select to authenticated
  using ((select auth.uid()) in (user_one, user_two));

grant select on public.friend_requests, public.friends to authenticated;

create function public.send_friend_request(p_receiver_id uuid)
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
  if v_user_id is null then
    raise exception 'You must be signed in to send a friend request';
  end if;
  if p_receiver_id is null or p_receiver_id = v_user_id then
    raise exception 'Choose another member to send a friend request';
  end if;
  if not exists (select 1 from public.profiles where id = p_receiver_id) then
    raise exception 'That member could not be found';
  end if;

  v_user_one := least(v_user_id, p_receiver_id);
  v_user_two := greatest(v_user_id, p_receiver_id);

  if exists (select 1 from public.friends where user_one = v_user_one and user_two = v_user_two) then
    raise exception 'You are already friends';
  end if;
  if exists (select 1 from public.friend_requests where status = 'pending' and least(sender_id, receiver_id) = v_user_one and greatest(sender_id, receiver_id) = v_user_two) then
    raise exception 'A friend request is already pending between you';
  end if;

  insert into public.friend_requests (sender_id, receiver_id)
  values (v_user_id, p_receiver_id)
  returning id into v_request_id;

  return v_request_id;
end;
$$;

create function public.respond_to_friend_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_request public.friend_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to respond to a friend request';
  end if;

  select * into v_request
  from public.friend_requests
  where id = p_request_id
  for update;

  if not found or v_request.receiver_id <> v_user_id or v_request.status <> 'pending' then
    raise exception 'That friend request is no longer available';
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

create function public.cancel_friend_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'You must be signed in to cancel a friend request';
  end if;

  update public.friend_requests
  set status = 'cancelled', updated_at = now()
  where id = p_request_id and sender_id = v_user_id and status = 'pending';

  if not found then
    raise exception 'That friend request is no longer available';
  end if;
end;
$$;

revoke all on function public.send_friend_request(uuid) from public;
revoke all on function public.respond_to_friend_request(uuid, boolean) from public;
revoke all on function public.cancel_friend_request(uuid) from public;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;

alter publication supabase_realtime add table public.friend_requests, public.friends;
