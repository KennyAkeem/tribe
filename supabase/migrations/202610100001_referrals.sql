alter table public.profiles
  add column referral_code text not null default encode(gen_random_bytes(12), 'hex');

create unique index profiles_referral_code_idx on public.profiles (referral_code);

create function public.prevent_referral_code_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.referral_code is distinct from old.referral_code then
    raise exception 'Referral codes cannot be changed';
  end if;
  return new;
end;
$$;

create trigger profiles_referral_code_immutable
  before update of referral_code on public.profiles
  for each row execute function public.prevent_referral_code_change();

create table public.user_referrals (
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  referred_user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_referrals_not_self check (referrer_id <> referred_user_id)
);

create index user_referrals_referrer_created_idx
  on public.user_referrals (referrer_id, created_at desc);

alter table public.user_referrals enable row level security;

create policy "Members can view their own referrals"
  on public.user_referrals for select to authenticated
  using ((select auth.uid()) = referrer_id);

grant select on public.user_referrals to authenticated;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_referrer_id uuid;
begin
  select profile.id into v_referrer_id
  from public.profiles as profile
  where profile.referral_code = nullif(new.raw_user_meta_data ->> 'referral_code', '')
    and profile.id <> new.id;

  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));

  if v_referrer_id is not null then
    insert into public.user_referrals (referrer_id, referred_user_id)
    values (v_referrer_id, new.id)
    on conflict (referred_user_id) do nothing;
  end if;

  return new;
end;
$$;