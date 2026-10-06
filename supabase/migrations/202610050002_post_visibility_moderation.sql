alter table public.posts
  add column if not exists is_hidden boolean not null default false,
  add column if not exists is_flagged boolean not null default false,
  add column if not exists flag_note text not null default '',
  add column if not exists flagged_by uuid references public.profiles (id) on delete set null,
  add column if not exists flagged_at timestamptz;

alter table public.posts
  drop constraint if exists post_flag_note_length,
  add constraint post_flag_note_length check (length(flag_note) <= 1000);

create index if not exists posts_flagged_created_idx
  on public.posts (created_at desc) where is_flagged;

create or replace function public.protect_post_moderation_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_admin() and (
    new.is_flagged is distinct from old.is_flagged
    or new.flag_note is distinct from old.flag_note
    or new.flagged_by is distinct from old.flagged_by
    or new.flagged_at is distinct from old.flagged_at
  ) then
    raise exception 'Only administrators can change post moderation fields';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_post_moderation_fields() from public;
create trigger protect_post_moderation_fields
  before update on public.posts
  for each row execute function public.protect_post_moderation_fields();

drop policy if exists "Public posts are visible to everyone" on public.posts;
drop policy if exists "Authors can read their own posts" on public.posts;
drop policy if exists "Friends can read friends-only posts" on public.posts;
drop policy if exists "Admins can read all posts" on public.posts;
create policy "Public posts are visible to everyone"
  on public.posts for select to anon, authenticated
  using (visibility = 'public' and not is_hidden);
create policy "Authors can read their own posts"
  on public.posts for select to authenticated
  using ((select auth.uid()) = author_id);
create policy "Friends can read friends-only posts"
  on public.posts for select to authenticated
  using (
    visibility = 'friends'
    and not is_hidden
    and exists (
      select 1 from public.friends
      where (friends.user_one = (select auth.uid()) and friends.user_two = posts.author_id)
         or (friends.user_two = (select auth.uid()) and friends.user_one = posts.author_id)
    )
  );
create policy "Admins can read all posts"
  on public.posts for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Comments on public posts are visible to everyone" on public.comments;
drop policy if exists "Authors can comment on their own non-public posts" on public.comments;
drop policy if exists "Friends can read comments on friends-only posts" on public.comments;
create policy "Comments on public posts are visible to everyone"
  on public.comments for select to anon, authenticated
  using (exists (
    select 1 from public.posts
    where posts.id = comments.post_id
      and posts.visibility = 'public'
      and not posts.is_hidden
  ));
create policy "Authors can read comments on their own posts"
  on public.comments for select to authenticated
  using (exists (
    select 1 from public.posts
    where posts.id = comments.post_id and posts.author_id = (select auth.uid())
  ));
create policy "Friends can read comments on friends-only posts"
  on public.comments for select to authenticated
  using (exists (
    select 1 from public.posts
    where posts.id = comments.post_id
      and posts.visibility = 'friends'
      and not posts.is_hidden
      and exists (
        select 1 from public.friends
        where (friends.user_one = (select auth.uid()) and friends.user_two = posts.author_id)
           or (friends.user_two = (select auth.uid()) and friends.user_one = posts.author_id)
      )
  ));

drop policy if exists "Members can comment on public posts" on public.comments;
drop policy if exists "Friends can comment on friends-only posts" on public.comments;
create policy "Members can comment on public posts"
  on public.comments for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and exists (
      select 1 from public.posts
      where posts.id = comments.post_id
        and posts.visibility = 'public'
        and not posts.is_hidden
    )
    and public.comment_parent_matches_post(post_id, parent_comment_id)
  );
create policy "Friends can comment on friends-only posts"
  on public.comments for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and exists (
      select 1 from public.posts
      where posts.id = comments.post_id
        and posts.visibility = 'friends'
        and not posts.is_hidden
        and exists (
          select 1 from public.friends
          where (friends.user_one = (select auth.uid()) and friends.user_two = posts.author_id)
             or (friends.user_two = (select auth.uid()) and friends.user_one = posts.author_id)
        )
    )
    and public.comment_parent_matches_post(post_id, parent_comment_id)
  );

drop policy if exists "Likes on public posts are visible to everyone" on public.likes;
drop policy if exists "Authors can read likes on their own non-public posts" on public.likes;
drop policy if exists "Friends can read likes on friends-only posts" on public.likes;
create policy "Likes on public posts are visible to everyone"
  on public.likes for select to anon, authenticated
  using (exists (
    select 1 from public.posts
    where posts.id = likes.post_id
      and posts.visibility = 'public'
      and not posts.is_hidden
  ));
create policy "Authors can read likes on their own posts"
  on public.likes for select to authenticated
  using (exists (
    select 1 from public.posts
    where posts.id = likes.post_id and posts.author_id = (select auth.uid())
  ));
create policy "Friends can read likes on friends-only posts"
  on public.likes for select to authenticated
  using (exists (
    select 1 from public.posts
    where posts.id = likes.post_id
      and posts.visibility = 'friends'
      and not posts.is_hidden
      and exists (
        select 1 from public.friends
        where (friends.user_one = (select auth.uid()) and friends.user_two = posts.author_id)
           or (friends.user_two = (select auth.uid()) and friends.user_one = posts.author_id)
      )
  ));

drop policy if exists "Members can like public posts" on public.likes;
drop policy if exists "Members can like friends-only posts" on public.likes;
create policy "Members can like public posts"
  on public.likes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.posts
      where posts.id = likes.post_id
        and posts.visibility = 'public'
        and not posts.is_hidden
    )
  );
create policy "Members can like friends-only posts"
  on public.likes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.posts
      where posts.id = likes.post_id
        and posts.visibility = 'friends'
        and not posts.is_hidden
        and exists (
          select 1 from public.friends
          where (friends.user_one = (select auth.uid()) and friends.user_two = posts.author_id)
             or (friends.user_two = (select auth.uid()) and friends.user_one = posts.author_id)
        )
    )
  );

drop policy if exists "Members can read media attached to visible posts" on storage.objects;
create policy "Members can read media attached to visible posts"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'post-media'
    and exists (
      select 1 from public.posts
      where posts.media_path = storage.objects.name
        and (
          posts.author_id = (select auth.uid())
          or (
            not posts.is_hidden
            and (
              posts.visibility = 'public'
              or (
                posts.visibility = 'friends'
                and exists (
                  select 1 from public.friends
                  where (friends.user_one = (select auth.uid()) and friends.user_two = posts.author_id)
                     or (friends.user_two = (select auth.uid()) and friends.user_one = posts.author_id)
                )
              )
            )
          )
        )
    )
  );
drop policy if exists "Admins can read all post media" on storage.objects;
create policy "Admins can read all post media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'post-media'
    and (select public.is_admin())
  );
drop policy if exists "Members can delete post media from their own folder" on storage.objects;
create policy "Members and admins can delete post media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'post-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
    )
  );

create function public.admin_list_posts(p_offset integer default 0)
returns table (
  post_id uuid,
  author_id uuid,
  author_name text,
  author_username text,
  content text,
  media_path text,
  media_type text,
  visibility text,
  is_hidden boolean,
  is_flagged boolean,
  flag_note text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select posts.id,
    posts.author_id,
    coalesce(profiles.full_name, profiles.username, 'Member'),
    profiles.username,
    posts.content,
    posts.media_path,
    posts.media_type,
    posts.visibility::text,
    posts.is_hidden,
    posts.is_flagged,
    posts.flag_note,
    posts.created_at
  from public.posts as posts
  left join public.profiles as profiles on profiles.id = posts.author_id
  where public.is_admin()
  order by posts.created_at desc
  limit 100 offset greatest(coalesce(p_offset, 0), 0);
$$;

create function public.admin_set_post_flag(p_post_id uuid, p_is_flagged boolean, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_author_id uuid;
  v_note text := coalesce(p_note, '');
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if length(v_note) > 1000 then raise exception 'Flag note is too long'; end if;
  update public.posts as posts
  set is_flagged = p_is_flagged,
      flag_note = case when p_is_flagged then v_note else '' end,
      flagged_by = case when p_is_flagged then (select auth.uid()) else null end,
      flagged_at = case when p_is_flagged then now() else null end
  where posts.id = p_post_id
  returning posts.author_id into v_author_id;
  if not found then raise exception 'Post not found'; end if;
  insert into public.admin_audit_log (admin_id, action, target_user_id, entity_id, details)
  values ((select auth.uid()), case when p_is_flagged then 'post_flagged' else 'post_unflagged' end,
    v_author_id, p_post_id, jsonb_build_object('note', v_note));
end;
$$;

create function public.admin_delete_post(p_post_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_author_id uuid;
  v_media_path text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  delete from public.posts as posts
  where posts.id = p_post_id
  returning posts.author_id, posts.media_path into v_author_id, v_media_path;
  if not found then raise exception 'Post not found'; end if;
  insert into public.admin_audit_log (admin_id, action, target_user_id, entity_id)
  values ((select auth.uid()), 'post_deleted', v_author_id, p_post_id);
  return v_media_path;
end;
$$;

revoke all on function public.admin_list_posts(integer) from public;
revoke all on function public.admin_set_post_flag(uuid, boolean, text) from public;
revoke all on function public.admin_delete_post(uuid) from public;
grant execute on function public.admin_list_posts(integer) to authenticated;
grant execute on function public.admin_set_post_flag(uuid, boolean, text) to authenticated;
grant execute on function public.admin_delete_post(uuid) to authenticated;
