create function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  auth_created_at timestamptz,
  full_name text,
  username text,
  profile_created_at timestamptz,
  is_verified boolean,
  moderation_status text,
  restrictions text[],
  moderation_reason text,
  moderation_expires_at timestamptz,
  open_reports bigint
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select auth_users.id,
    auth_users.email::text,
    auth_users.created_at,
    coalesce(profiles.full_name, ''),
    profiles.username,
    profiles.created_at,
    coalesce(profiles.is_verified, false),
    coalesce(moderation.status, 'active'),
    coalesce(moderation.restrictions, '{}'::text[]),
    coalesce(moderation.reason, ''),
    moderation.expires_at,
    (select count(*) from public.user_reports as reports
      where reports.target_user_id = auth_users.id and reports.status in ('open', 'reviewing'))
  from auth.users as auth_users
  left join public.profiles on profiles.id = auth_users.id
  left join public.user_moderation as moderation on moderation.user_id = auth_users.id
  where public.is_admin()
  order by auth_users.created_at desc;
$$;

create function public.admin_list_verification_requests()
returns table (
  request_id uuid,
  user_id uuid,
  full_name text,
  username text,
  email text,
  phone_number text,
  country_code text,
  country_name text,
  government_id_type text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select requests.id,
    requests.user_id,
    coalesce(profiles.full_name, ''),
    profiles.username,
    auth_users.email::text,
    requests.phone_number,
    requests.country_code,
    requests.country_name,
    requests.government_id_type,
    requests.status,
    requests.created_at
  from public.verification_requests as requests
  join auth.users as auth_users on auth_users.id = requests.user_id
  left join public.profiles on profiles.id = requests.user_id
  where public.is_admin() and requests.status = 'pending'
  order by requests.created_at asc;
$$;

create function public.admin_list_reports()
returns table (
  report_id uuid,
  reporter_id uuid,
  reporter_name text,
  reporter_email text,
  target_user_id uuid,
  target_user_name text,
  target_user_email text,
  target_post_id uuid,
  target_post_content text,
  target_comment_id uuid,
  target_comment_content text,
  category text,
  details text,
  status text,
  admin_note text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select reports.id,
    reports.reporter_id,
    coalesce(reporter.full_name, reporter.username, 'Member'),
    reporter_auth.email::text,
    reports.target_user_id,
    coalesce(target_profile.full_name, target_profile.username, 'Member'),
    target_auth.email::text,
    reports.target_post_id,
    posts.content,
    reports.target_comment_id,
    comments.content,
    reports.category,
    reports.details,
    reports.status,
    reports.admin_note,
    reports.created_at
  from public.user_reports as reports
  join auth.users as reporter_auth on reporter_auth.id = reports.reporter_id
  left join public.profiles as reporter on reporter.id = reports.reporter_id
  left join auth.users as target_auth on target_auth.id = reports.target_user_id
  left join public.profiles as target_profile on target_profile.id = reports.target_user_id
  left join public.posts as posts on posts.id = reports.target_post_id
  left join public.comments as comments on comments.id = reports.target_comment_id
  where public.is_admin()
  order by reports.created_at desc;
$$;

create function public.my_verification_requests()
returns table (request_id uuid, status text, review_note text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select requests.id, requests.status, requests.review_note, requests.created_at
  from public.verification_requests as requests
  where requests.user_id = (select auth.uid())
  order by requests.created_at desc;
$$;

revoke all on function public.admin_list_users() from public;
revoke all on function public.admin_list_verification_requests() from public;
revoke all on function public.admin_list_reports() from public;
revoke all on function public.my_verification_requests() from public;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_list_verification_requests() to authenticated;
grant execute on function public.admin_list_reports() to authenticated;
grant execute on function public.my_verification_requests() to authenticated;