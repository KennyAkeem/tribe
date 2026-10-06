alter table public.profiles
  add column if not exists location text;

alter table public.profiles
  add constraint profiles_location_length
  check (location is null or length(btrim(location)) between 1 and 120);

create table public.location_lookup_gate (
  id boolean primary key default true check (id),
  next_request_at timestamptz not null default '-infinity'::timestamptz
);
insert into public.location_lookup_gate (id) values (true) on conflict (id) do nothing;
alter table public.location_lookup_gate enable row level security;

create function public.claim_location_lookup()
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
  v_next_request_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Sign in to update your location';
  end if;

  select next_request_at
    into v_next_request_at
  from public.location_lookup_gate
  where id = true
  for update;

  if v_next_request_at > v_now then
    return false;
  end if;

  update public.location_lookup_gate
  set next_request_at = v_now + interval '1 second'
  where id = true;
  return true;
end;
$$;
revoke all on function public.claim_location_lookup() from public;
grant execute on function public.claim_location_lookup() to authenticated;

create function public.set_my_profile_location(p_location text)
returns text
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_location text := nullif(btrim(p_location), '');
begin
  if v_user_id is null then
    raise exception 'Sign in to update your location';
  end if;
  if v_location is not null and length(v_location) > 120 then
    raise exception 'Location must be 120 characters or fewer';
  end if;

  update public.profiles
  set location = v_location,
      updated_at = now()
  where id = v_user_id;

  if not found then
    raise exception 'Your profile could not be found';
  end if;

  return v_location;
end;
$$;
revoke all on function public.set_my_profile_location(text) from public;
grant execute on function public.set_my_profile_location(text) to authenticated;
