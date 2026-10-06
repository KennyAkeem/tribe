create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_one uuid not null references public.profiles (id) on delete cascade,
  user_two uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_distinct_members check (user_one < user_two),
  constraint conversations_unique_direct_pair unique (user_one, user_two)
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint message_content_length check (length(trim(content)) between 1 and 4000)
);

create index conversations_user_one_updated_idx on public.conversations (user_one, updated_at desc);
create index conversations_user_two_updated_idx on public.conversations (user_two, updated_at desc);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc);
create index messages_unread_idx on public.messages (conversation_id, read_at) where read_at is null;

create function public.create_direct_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_user_one uuid;
  v_user_two uuid;
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to start a conversation';
  end if;
  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'Choose another member to start a conversation';
  end if;
  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'That member could not be found';
  end if;

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

revoke all on function public.create_direct_conversation(uuid) from public;
grant execute on function public.create_direct_conversation(uuid) to authenticated;

create function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set updated_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

create trigger on_message_created
  after insert on public.messages
  for each row execute procedure public.touch_conversation_on_message();

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create policy "Members can view their conversations"
  on public.conversations for select to authenticated
  using ((select auth.uid()) in (user_one, user_two));

create policy "Members can view their own membership rows"
  on public.conversation_members for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Conversation members can read messages"
  on public.messages for select to authenticated
  using (exists (
    select 1 from public.conversation_members
    where conversation_members.conversation_id = messages.conversation_id
      and conversation_members.user_id = (select auth.uid())
  ));

create policy "Members can send messages as themselves"
  on public.messages for insert to authenticated
  with check (
    (select auth.uid()) = sender_id
    and exists (
      select 1 from public.conversation_members
      where conversation_members.conversation_id = messages.conversation_id
        and conversation_members.user_id = (select auth.uid())
    )
  );

create policy "Recipients can mark messages as read"
  on public.messages for update to authenticated
  using (
    sender_id <> (select auth.uid())
    and exists (
      select 1 from public.conversation_members
      where conversation_members.conversation_id = messages.conversation_id
        and conversation_members.user_id = (select auth.uid())
    )
  )
  with check (
    sender_id <> (select auth.uid())
    and exists (
      select 1 from public.conversation_members
      where conversation_members.conversation_id = messages.conversation_id
        and conversation_members.user_id = (select auth.uid())
    )
  );

grant select on public.conversations, public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

alter publication supabase_realtime add table public.conversations, public.messages;