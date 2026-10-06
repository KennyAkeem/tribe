create table public.call_signals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  call_id uuid not null,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  signal_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint call_signal_distinct_participants check (sender_id <> recipient_id),
  constraint call_signal_type check (signal_type in ('invite', 'accept', 'reject', 'busy', 'offer', 'answer', 'ice_candidate', 'end')),
  constraint call_signal_payload_size check (octet_length(payload::text) <= 131072)
);

create index call_signals_recipient_created_idx
  on public.call_signals (recipient_id, created_at desc);
create index call_signals_call_created_idx
  on public.call_signals (call_id, created_at);

alter table public.call_signals enable row level security;

create policy "Conversation participants can read call signals"
  on public.call_signals for select to authenticated
  using (
    (select auth.uid()) in (sender_id, recipient_id)
    and exists (
      select 1 from public.conversations
      where conversations.id = call_signals.conversation_id
        and (select auth.uid()) in (conversations.user_one, conversations.user_two)
        and call_signals.sender_id in (conversations.user_one, conversations.user_two)
        and call_signals.recipient_id in (conversations.user_one, conversations.user_two)
    )
  );

create policy "Conversation members can send call signals to each other"
  on public.call_signals for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversations
      where conversations.id = call_signals.conversation_id
        and (select auth.uid()) in (conversations.user_one, conversations.user_two)
        and call_signals.recipient_id in (conversations.user_one, conversations.user_two)
    )
  );

create policy "Call participants can delete consumed signals"
  on public.call_signals for delete to authenticated
  using (
    (select auth.uid()) in (sender_id, recipient_id)
    and exists (
      select 1 from public.conversations
      where conversations.id = call_signals.conversation_id
        and (select auth.uid()) in (conversations.user_one, conversations.user_two)
    )
  );

grant select, insert, delete on public.call_signals to authenticated;
alter publication supabase_realtime add table public.call_signals;
