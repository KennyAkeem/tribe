create extension if not exists pgcrypto;

create type public.post_visibility as enum ('public', 'friends');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  full_name text not null default '',
  avatar_url text,
  cover_url text,
  bio text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username is null or username ~ '^[a-zA-Z0-9_]{3,24}$')
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '',
  image_url text,
  visibility public.post_visibility not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_has_content check (length(trim(content)) > 0 or image_url is not null),
  constraint post_content_length check (length(content) <= 5000)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_comment_id uuid references public.comments (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint comment_content_length check (length(trim(content)) between 1 and 2000)
);

create table public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index posts_feed_created_at_idx on public.posts (created_at desc);
create index posts_author_created_at_idx on public.posts (author_id, created_at desc);
create index comments_post_created_at_idx on public.comments (post_id, created_at desc);
create index likes_user_id_idx on public.likes (user_id);

create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;

create policy "Profiles are visible to everyone"
  on public.profiles for select to anon, authenticated using (true);
create policy "Members can create their own profile"
  on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Members can update their own profile"
  on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Public posts are visible to everyone"
  on public.posts for select to anon, authenticated using (visibility = 'public');
create policy "Authors can read their own posts"
  on public.posts for select to authenticated using ((select auth.uid()) = author_id);
create policy "Members can create their own posts"
  on public.posts for insert to authenticated with check ((select auth.uid()) = author_id);
create policy "Authors can update their own posts"
  on public.posts for update to authenticated using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy "Authors can delete their own posts"
  on public.posts for delete to authenticated using ((select auth.uid()) = author_id);

create policy "Comments on public posts are visible to everyone"
  on public.comments for select to anon, authenticated
  using (exists (select 1 from public.posts where posts.id = comments.post_id and posts.visibility = 'public'));
create policy "Authors can comment on their own non-public posts"
  on public.comments for select to authenticated
  using (exists (select 1 from public.posts where posts.id = comments.post_id and posts.author_id = (select auth.uid())));
create policy "Members can comment on public posts"
  on public.comments for insert to authenticated
  with check ((select auth.uid()) = author_id and exists (select 1 from public.posts where posts.id = comments.post_id and posts.visibility = 'public'));
create policy "Members can delete their own comments"
  on public.comments for delete to authenticated using ((select auth.uid()) = author_id);

create policy "Likes on public posts are visible to everyone"
  on public.likes for select to anon, authenticated
  using (exists (select 1 from public.posts where posts.id = likes.post_id and posts.visibility = 'public'));
create policy "Authors can read likes on their own non-public posts"
  on public.likes for select to authenticated
  using (exists (select 1 from public.posts where posts.id = likes.post_id and posts.author_id = (select auth.uid())));
create policy "Members can like public posts"
  on public.likes for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.posts where posts.id = likes.post_id and posts.visibility = 'public'));
create policy "Members can remove their own likes"
  on public.likes for delete to authenticated using ((select auth.uid()) = user_id);

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.posts, public.comments, public.likes to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant insert, update, delete on public.posts to authenticated;
grant insert, delete on public.comments, public.likes to authenticated;

alter publication supabase_realtime add table public.posts, public.comments, public.likes;