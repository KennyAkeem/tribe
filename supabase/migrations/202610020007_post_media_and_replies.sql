alter table public.posts
  add column if not exists media_path text,
  add column if not exists media_type text;

alter table public.posts drop constraint if exists post_has_content;
alter table public.posts drop constraint if exists post_media_pair;
alter table public.posts
  add constraint post_has_content
    check (length(trim(content)) > 0 or image_url is not null or media_path is not null),
  add constraint post_media_pair
    check (
      (media_path is null and media_type is null)
      or (media_path is not null and media_type is not null and media_type in ('image', 'video'))
    );

create index if not exists posts_media_path_idx on public.posts (media_path) where media_path is not null;
create index if not exists comments_parent_created_idx on public.comments (parent_comment_id, created_at)
  where parent_comment_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members can upload post media to their own folder" on storage.objects;
create policy "Members can upload post media to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
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
          posts.visibility = 'public'
          or posts.author_id = (select auth.uid())
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
  );

drop policy if exists "Members can delete post media from their own folder" on storage.objects;
create policy "Members can delete post media from their own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Members can comment on public posts" on public.comments;
create policy "Members can comment on public posts"
  on public.comments for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and exists (
      select 1 from public.posts
      where posts.id = comments.post_id and posts.visibility = 'public'
    )
    and (
      parent_comment_id is null
      or exists (
        select 1 from public.comments parent
        where parent.id = comments.parent_comment_id
          and parent.post_id = comments.post_id
          and parent.parent_comment_id is null
      )
    )
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
    and (
      parent_comment_id is null
      or exists (
        select 1 from public.comments parent
        where parent.id = comments.parent_comment_id
          and parent.post_id = comments.post_id
          and parent.parent_comment_id is null
      )
    )
  );