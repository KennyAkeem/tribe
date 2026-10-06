create table public.admin_emails (
  email text primary key check (email = lower(btrim(email))),
  added_at timestamptz not null default now()
);
alter table public.admin_emails enable row level security;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from auth.users as auth_user
    join public.admin_emails as allowlisted on allowlisted.email = lower(auth_user.email)
    where auth_user.id = (select auth.uid())
      and auth_user.email_confirmed_at is not null
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles add column is_verified boolean not null default false;
revoke insert, update on public.profiles from authenticated;
grant update (full_name, username, bio, avatar_url, cover_url, updated_at) on public.profiles to authenticated;
create policy "Admins can update profile verification badges"
  on public.profiles for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create table public.user_moderation (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  status text not null default 'active',
  restrictions text[] not null default '{}',
  reason text not null default '',
  expires_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint user_moderation_status check (status in ('active', 'restricted', 'suspended', 'banned')),
  constraint user_moderation_restrictions check (restrictions <@ array['posting', 'commenting', 'appreciating', 'messaging', 'friend_requests', 'calls']::text[]),
  constraint user_moderation_reason_length check (length(reason) <= 1000)
);
alter table public.user_moderation enable row level security;
create policy "Members and admins can view moderation status"
  on public.user_moderation for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
grant select on public.user_moderation to authenticated;

create function public.user_can(p_user_id uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select case
    when p_user_id is null then false
    when public.is_admin() then true
    when p_user_id <> (select auth.uid()) then false
    else not exists (
      select 1 from public.user_moderation as moderation
      where moderation.user_id = p_user_id
        and (moderation.expires_at is null or moderation.expires_at > now())
        and (
          moderation.status in ('suspended', 'banned')
          or (moderation.status = 'restricted' and p_action = any(moderation.restrictions))
        )
    )
  end;
$$;
revoke all on function public.user_can(uuid, text) from public;
grant execute on function public.user_can(uuid, text) to authenticated;

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  phone_number text not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  country_name text not null,
  government_id_type text not null check (government_id_type in ('passport', 'national_id', 'drivers_license', 'residence_permit', 'other')),
  government_id_ciphertext text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  review_note text not null default '',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint verification_phone_length check (length(phone_number) between 5 and 40),
  constraint verification_country_name_length check (length(country_name) between 2 and 100),
  constraint verification_ciphertext_length check (government_id_ciphertext is null or length(government_id_ciphertext) between 40 and 1000),
  constraint verification_pending_ciphertext check (status <> 'pending' or government_id_ciphertext is not null),
  constraint verification_review_note_length check (length(review_note) <= 1000)
);
create unique index verification_one_pending_per_user_idx
  on public.verification_requests (user_id) where status = 'pending';
create index verification_review_queue_idx
  on public.verification_requests (created_at desc) where status = 'pending';
alter table public.verification_requests enable row level security;
create policy "Members can submit their own verification request"
  on public.verification_requests for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and exists (select 1 from public.profiles where profiles.id = user_id and not profiles.is_verified)
  );
create policy "Members and admins can read verification requests"
  on public.verification_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
grant select on public.verification_requests to authenticated;

create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_user_id uuid references public.profiles (id) on delete cascade,
  target_post_id uuid references public.posts (id) on delete cascade,
  target_comment_id uuid references public.comments (id) on delete cascade,
  category text not null check (category in ('harassment', 'spam', 'impersonation', 'unsafe_content', 'other')),
  details text not null default '',
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  admin_note text not null default '',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint report_one_target check (num_nonnulls(target_user_id, target_post_id, target_comment_id) = 1),
  constraint report_not_self check (target_user_id is null or target_user_id <> reporter_id),
  constraint report_details_length check (length(details) <= 2000),
  constraint report_admin_note_length check (length(admin_note) <= 1000)
);
create index user_reports_queue_idx on public.user_reports (status, created_at desc);
alter table public.user_reports enable row level security;
create policy "Members can submit reports"
  on public.user_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open' and reviewed_by is null and reviewed_at is null);
create policy "Reporters and admins can read reports"
  on public.user_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));
grant select, insert on public.user_reports to authenticated;

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_user_id uuid references public.profiles (id) on delete set null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
create policy "Admins can read audit log"
  on public.admin_audit_log for select to authenticated
  using ((select public.is_admin()));
grant select on public.admin_audit_log to authenticated;