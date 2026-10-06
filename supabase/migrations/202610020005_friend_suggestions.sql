create function public.get_friend_suggestions(p_limit integer default 6)
returns table (
  id uuid,
  full_name text,
  username text,
  avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    candidate.id,
    candidate.full_name,
    candidate.username,
    candidate.avatar_url
  from public.profiles as candidate
  where candidate.id <> (select auth.uid())
    and not exists (
      select 1
      from public.friends as friendship
      where friendship.user_one = least((select auth.uid()), candidate.id)
        and friendship.user_two = greatest((select auth.uid()), candidate.id)
    )
    and not exists (
      select 1
      from public.friend_requests as request
      where request.status = 'pending'
        and least(request.sender_id, request.receiver_id) = least((select auth.uid()), candidate.id)
        and greatest(request.sender_id, request.receiver_id) = greatest((select auth.uid()), candidate.id)
    )
  order by candidate.created_at desc
  limit greatest(1, least(coalesce(p_limit, 6), 20));
$$;

revoke all on function public.get_friend_suggestions(integer) from public;
grant execute on function public.get_friend_suggestions(integer) to authenticated;
