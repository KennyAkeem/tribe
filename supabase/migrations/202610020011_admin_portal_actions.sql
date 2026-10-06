create function public.admin_set_moderation(
  p_user_id uuid,
  p_status text,
  p_restrictions text[] default '{}',
  p_reason text default '',
  p_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_status is null or p_status not in ('active', 'restricted', 'suspended', 'banned') then raise exception 'Invalid moderation status'; end if;
  if exists (
    select 1 from unnest(coalesce(p_restrictions, '{}'::text[])) as item(value)
    where item.value <> all (array['posting', 'commenting', 'appreciating', 'messaging', 'friend_requests', 'calls']::text[])
  ) then raise exception 'Invalid restriction'; end if;
  if p_status = 'restricted' and coalesce(cardinality(p_restrictions), 0) = 0 then raise exception 'Choose at least one restriction'; end if;
  if length(coalesce(p_reason, '')) > 1000 then raise exception 'Reason is too long'; end if;
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'User not found'; end if;
  if exists (
    select 1 from auth.users as target
    join public.admin_emails as admins on admins.email = lower(target.email)
    where target.id = p_user_id
  ) then raise exception 'Administrator accounts cannot be moderated'; end if;

  insert into public.user_moderation (user_id, status, restrictions, reason, expires_at, updated_by, updated_at)
  values (
    p_user_id,
    p_status,
    case when p_status = 'restricted' then coalesce(p_restrictions, '{}'::text[]) else '{}'::text[] end,
    coalesce(p_reason, ''),
    p_expires_at,
    auth.uid(),
    now()
  )
  on conflict (user_id) do update set
    status = excluded.status,
    restrictions = excluded.restrictions,
    reason = excluded.reason,
    expires_at = excluded.expires_at,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.admin_audit_log (admin_id, action, target_user_id, details)
  values (auth.uid(), 'moderation_changed', p_user_id,
    jsonb_build_object('status', p_status, 'restrictions', p_restrictions, 'reason', p_reason, 'expires_at', p_expires_at));
end;
$$;

create function public.admin_review_verification(p_request_id uuid, p_approve boolean, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  request_row public.verification_requests%rowtype;
  result_status text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_approve is null then raise exception 'Choose approve or decline'; end if;
  if length(coalesce(p_note, '')) > 1000 then raise exception 'Review note is too long'; end if;
  select * into request_row from public.verification_requests where id = p_request_id for update;
  if not found or request_row.status <> 'pending' then raise exception 'This request is no longer pending'; end if;

  result_status := case when p_approve then 'approved' else 'declined' end;
  update public.verification_requests
  set status = result_status,
      review_note = coalesce(p_note, ''),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      government_id_ciphertext = null
  where id = p_request_id;
  update public.profiles set is_verified = p_approve where id = request_row.user_id;
  insert into public.admin_audit_log (admin_id, action, target_user_id, entity_id, details)
  values (auth.uid(), 'verification_reviewed', request_row.user_id, p_request_id,
    jsonb_build_object('decision', result_status, 'note', p_note));
end;
$$;

create function public.admin_resolve_report(p_report_id uuid, p_status text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  report_row public.user_reports%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_status is null or p_status not in ('reviewing', 'resolved', 'dismissed') then raise exception 'Invalid report status'; end if;
  if length(coalesce(p_note, '')) > 1000 then raise exception 'Admin note is too long'; end if;
  select * into report_row from public.user_reports where id = p_report_id for update;
  if not found then raise exception 'Report not found'; end if;

  update public.user_reports
  set status = p_status,
      admin_note = coalesce(p_note, ''),
      reviewed_by = auth.uid(),
      reviewed_at = case when p_status = 'reviewing' then null else now() end
  where id = p_report_id;
  insert into public.admin_audit_log (admin_id, action, target_user_id, entity_id, details)
  values (auth.uid(), 'report_updated', report_row.target_user_id, p_report_id,
    jsonb_build_object('status', p_status, 'note', p_note));
end;
$$;

create function public.admin_record_identity_access(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if not exists (
    select 1 from public.verification_requests
    where id = p_request_id and status = 'pending'
  ) then raise exception 'Pending verification request not found'; end if;
  insert into public.admin_audit_log (admin_id, action, target_user_id, entity_id)
  select auth.uid(), 'verification_id_accessed', user_id, id
  from public.verification_requests where id = p_request_id;
end;
$$;

revoke all on function public.admin_set_moderation(uuid, text, text[], text, timestamptz) from public;
revoke all on function public.admin_review_verification(uuid, boolean, text) from public;
revoke all on function public.admin_resolve_report(uuid, text, text) from public;
revoke all on function public.admin_record_identity_access(uuid) from public;
grant execute on function public.admin_set_moderation(uuid, text, text[], text, timestamptz) to authenticated;
grant execute on function public.admin_review_verification(uuid, boolean, text) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text, text) to authenticated;
grant execute on function public.admin_record_identity_access(uuid) to authenticated;
