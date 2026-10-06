create policy "Friends can read friends-only posts"
  on public.posts for select to authenticated
  using (
    visibility = 'friends'
    and exists (
      select 1 from public.friends
      where (friends.user_one = (select auth.uid()) and friends.user_two = posts.author_id)
         or (friends.user_two = (select auth.uid()) and friends.user_one = posts.author_id)
    )
  );

create policy "Friends can read comments on friends-only posts"
  on public.comments for select to authenticated
  using (exists (
    select 1 from public.posts
    where posts.id = comments.post_id
      and posts.visibility = 'friends'
      and exists (
        select 1 from public.friends
        where (friends.user_one = (select auth.uid()) and friends.user_two = posts.author_id)
           or (friends.user_two = (select auth.uid()) and friends.user_one = posts.author_id)
      )
  ));

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
  );

create policy "Friends can read likes on friends-only posts"
  on public.likes for select to authenticated
  using (exists (
    select 1 from public.posts
    where posts.id = likes.post_id
      and posts.visibility = 'friends'
      and exists (
        select 1 from public.friends
        where (friends.user_one = (select auth.uid()) and friends.user_two = posts.author_id)
           or (friends.user_two = (select auth.uid()) and friends.user_one = posts.author_id)
      )
  ));

create policy "Members can like friends-only posts"
  on public.likes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.posts
      where posts.id = likes.post_id
        and posts.visibility = 'friends'
        and exists (
          select 1 from public.friends
          where (friends.user_one = (select auth.uid()) and friends.user_two = posts.author_id)
             or (friends.user_two = (select auth.uid()) and friends.user_one = posts.author_id)
        )
    )
  );
