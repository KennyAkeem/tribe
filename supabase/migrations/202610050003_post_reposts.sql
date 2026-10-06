alter table public.posts
  add column if not exists repost_of uuid references public.posts (id) on delete cascade;

alter table public.posts drop constraint if exists post_has_content;
alter table public.posts
  add constraint post_has_content
    check (length(trim(content)) > 0 or image_url is not null or media_path is not null or repost_of is not null);

create index if not exists posts_repost_of_idx
  on public.posts (repost_of) where repost_of is not null;

create or replace function public.post_repost_source_available(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select p_post_id is null or exists (
    select 1 from public.posts as source
    where source.id = p_post_id
      and source.visibility = 'public'
      and not source.is_hidden
  );
$$;

revoke all on function public.post_repost_source_available(uuid) from public;
grant execute on function public.post_repost_source_available(uuid) to anon, authenticated;

drop policy if exists "Public posts are visible to everyone" on public.posts;
drop policy if exists "Authors can read their own posts" on public.posts;
drop policy if exists "Friends can read friends-only posts" on public.posts;
drop policy if exists "Admins can read all posts" on public.posts;
drop policy if exists "Members can create their own posts" on public.posts;
create policy "Public posts are visible to everyone"
  on public.posts for select to anon, authenticated
  using (visibility = 'public' and not is_hidden and public.post_repost_source_available(repost_of));
create policy "Authors can read their own posts"
  on public.posts for select to authenticated
  using ((select auth.uid()) = author_id and public.post_repost_source_available(repost_of));
create policy "Friends can read friends-only posts"
  on public.posts for select to authenticated
  using (
    visibility = 'friends'
    and not is_hidden
    and public.post_repost_source_available(repost_of)
    and exists (
      select 1 from public.friends
      where (friends.user_one = (select auth.uid()) and friends.user_two = posts.author_id)
         or (friends.user_two = (select auth.uid()) and friends.user_one = posts.author_id)
    )
  );
create policy "Admins can read all posts"
  on public.posts for select to authenticated
  using ((select public.is_admin()));
create policy "Members can create their own posts"
  on public.posts for insert to authenticated
  with check ((select auth.uid()) = author_id and repost_of is null);

create or replace function public.protect_post_repost_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.repost_of is distinct from old.repost_of and not public.is_admin() then
    raise exception 'Use the repost action to reference another post';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_post_repost_reference() from public;
drop trigger if exists protect_post_repost_reference on public.posts;
create trigger protect_post_repost_reference
  before update on public.posts
  for each row execute function public.protect_post_repost_reference();

create or replace function public.repost_post(p_post_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_source_id uuid;
  v_original_author_id uuid;
  v_post_visibility public.post_visibility;
  v_post_hidden boolean;
  v_repost_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to repost posts'; end if;
  if not public.user_can((select auth.uid()), 'posting') then raise exception 'Posting is restricted for this account'; end if;

  select posts.visibility, posts.is_hidden, coalesce(posts.repost_of, posts.id)
    into v_post_visibility, v_post_hidden, v_source_id
  from public.posts as posts
  where posts.id = p_post_id;
  if not found then raise exception 'Post not found'; end if;
  if v_post_visibility <> 'public' or v_post_hidden then raise exception 'Only public posts can be reposted'; end if;

  select source.author_id into v_original_author_id
  from public.posts as source
  where source.id = v_source_id
    and source.visibility = 'public'
    and not source.is_hidden;
  if not found then raise exception 'This post is no longer available to repost'; end if;
  if v_original_author_id = (select auth.uid()) then raise exception 'You cannot repost your own post'; end if;

  insert into public.posts (author_id, content, visibility, repost_of)
  values ((select auth.uid()), '', 'public', v_source_id)
  returning id into v_repost_id;
  return v_repost_id;
end;
$$;

revoke all on function public.repost_post(uuid) from public;
grant execute on function public.repost_post(uuid) to authenticated;
