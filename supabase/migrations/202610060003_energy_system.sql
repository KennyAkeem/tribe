create table public.energy_balances (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  balance bigint not null default 100 check (balance >= 0),
  accrued_through date not null default (now() at time zone 'utc')::date
);

insert into public.energy_balances (user_id, balance, accrued_through)
select id, 100, (now() at time zone 'utc')::date
from public.profiles
on conflict (user_id) do nothing;

alter table public.energy_balances enable row level security;
create policy "Members can view their own energy balance"
  on public.energy_balances for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.energy_balances to authenticated;

alter table public.posts
  add column if not exists energy_total bigint not null default 0 check (energy_total >= 0);
revoke insert on public.posts from authenticated;
grant insert (author_id, content, image_url, visibility, media_path, media_type) on public.posts to authenticated;
revoke update on public.posts from authenticated;
grant update (is_hidden) on public.posts to authenticated;

create table public.energy_chat_rewards (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  reward_date date not null,
  created_at timestamptz not null default now(),
  primary key (conversation_id, reward_date)
);
alter table public.energy_chat_rewards enable row level security;

create function public.create_energy_account_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.energy_balances (user_id, balance, accrued_through)
  values (new.id, 100, (now() at time zone 'utc')::date)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_profile_created_energy_account
  after insert on public.profiles
  for each row execute procedure public.create_energy_account_for_profile();

create function public.get_energy_balance()
returns bigint
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
begin
  if v_user_id is null then
    raise exception 'Sign in to check your energy balance';
  end if;

  insert into public.energy_balances (user_id, balance, accrued_through)
  values (v_user_id, 100, v_today)
  on conflict (user_id) do nothing;

  select balance, accrued_through
    into v_balance, v_accrued_through
  from public.energy_balances
  where user_id = v_user_id
  for update;

  if v_accrued_through < v_today then
    v_balance := v_balance + (v_today - v_accrued_through)::bigint * 100;
    update public.energy_balances
    set balance = v_balance, accrued_through = v_today
    where user_id = v_user_id;
  end if;

  return v_balance;
end;
$$;
revoke all on function public.get_energy_balance() from public;
grant execute on function public.get_energy_balance() to authenticated;

create function public.send_post_energy(p_post_id uuid)
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
  if v_user_id is null then
    raise exception 'Sign in to send energy';
  end if;
  perform public.require_user_can(v_user_id, 'appreciating');

  select author_id, visibility, is_hidden
    into v_author_id, v_visibility, v_is_hidden
  from public.posts
  where id = p_post_id
  for update;
  if not found then
    raise exception 'This post is unavailable';
  end if;
  if v_author_id = v_user_id then
    raise exception 'You cannot send energy to your own post';
  end if;
  if v_is_hidden or (
    v_visibility = 'friends'
    and not exists (
      select 1 from public.friends
      where (user_one = v_user_id and user_two = v_author_id)
         or (user_two = v_user_id and user_one = v_author_id)
    )
  ) then
    raise exception 'This post is unavailable';
  end if;

  insert into public.energy_balances (user_id, balance, accrued_through)
  values (v_user_id, 100, v_today)
  on conflict (user_id) do nothing;

  select balance, accrued_through
    into v_balance, v_accrued_through
  from public.energy_balances
  where user_id = v_user_id
  for update;

  if v_accrued_through < v_today then
    v_balance := v_balance + (v_today - v_accrued_through)::bigint * 100;
  end if;
  if v_balance < 1 then
    raise exception 'You are out of energy. Chat with someone to earn more.';
  end if;

  update public.energy_balances
  set balance = v_balance - 1, accrued_through = v_today
  where user_id = v_user_id;

  update public.posts
  set energy_total = energy_total + 1
  where id = p_post_id
  returning energy_total into v_post_energy;

  return jsonb_build_object('balance', v_balance - 1, 'post_energy', v_post_energy);
end;
$$;
revoke all on function public.send_post_energy(uuid) from public;
grant execute on function public.send_post_energy(uuid) to authenticated;

create function public.reward_energy_for_reciprocal_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_user_one uuid;
  v_user_two uuid;
  v_rewarded_conversation uuid;
  v_user_id uuid;
begin
  select user_one, user_two
    into v_user_one, v_user_two
  from public.conversations
  where id = new.conversation_id;

  if not exists (
    select 1 from public.messages
    where conversation_id = new.conversation_id
      and sender_id <> new.sender_id
  ) then
    return new;
  end if;

  insert into public.energy_chat_rewards (conversation_id, reward_date)
  values (new.conversation_id, v_today)
  on conflict (conversation_id, reward_date) do nothing
  returning conversation_id into v_rewarded_conversation;

  if v_rewarded_conversation is null then
    return new;
  end if;

  foreach v_user_id in array array[v_user_one, v_user_two]
  loop
    insert into public.energy_balances (user_id, balance, accrued_through)
    values (v_user_id, 100, v_today)
    on conflict (user_id) do nothing;

    update public.energy_balances
    set balance = balance + greatest(v_today - accrued_through, 0)::bigint * 100 + 10,
        accrued_through = v_today
    where user_id = v_user_id;
  end loop;

  return new;
end;
$$;

create trigger on_reciprocal_chat_energy_reward
  after insert on public.messages
  for each row execute procedure public.reward_energy_for_reciprocal_chat();

alter publication supabase_realtime add table public.energy_balances;
