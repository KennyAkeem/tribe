create or replace function public.comment_parent_matches_post(
  p_post_id uuid,
  p_parent_comment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select p_parent_comment_id is null or exists (
    select 1
    from public.comments as parent
    where parent.id = p_parent_comment_id
      and parent.post_id = p_post_id
      and parent.parent_comment_id is null
  );
$$;

revoke all on function public.comment_parent_matches_post(uuid, uuid) from public;
grant execute on function public.comment_parent_matches_post(uuid, uuid) to authenticated;

drop policy if exists "Members can comment on public posts" on public.comments;
create policy "Members can comment on public posts"
  on public.comments for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and exists (
      select 1 from public.posts
      where posts.id = comments.post_id and posts.visibility = 'public'
    )
    and public.comment_parent_matches_post(post_id, parent_comment_id)
  );

drop policy if exists "Friends can comment on friends-only posts" on public.comments;
create policy "Friends can comment on friends-only posts"
  on public.comments for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and exists (
      select 1 from public.posts
      where posts.id = comments.post_id
        and posts.visibility = 'friends'
        and exists (
          select 1 from public.friends
          where (friends.user_one = (select auth.uid()) and friends.user_two = posts.author_id)
             or (friends.user_two = (select auth.uid()) and friends.user_one = posts.author_id)
        )
    )
    and public.comment_parent_matches_post(post_id, parent_comment_id)
  );