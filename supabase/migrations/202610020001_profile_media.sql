insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create unique index if not exists profiles_username_lower_unique_idx
  on public.profiles (lower(username))
  where username is not null;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Avatar images are publicly readable'
  ) then
    execute 'create policy "Avatar images are publicly readable" on storage.objects for select using (bucket_id = ''avatars'');';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Members can upload their own avatar images'
  ) then
    execute 'create policy "Members can upload their own avatar images" on storage.objects for insert to authenticated with check (bucket_id = ''avatars'' and (storage.foldername(name))[1] = (select auth.uid())::text);';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Members can update their own avatar images'
  ) then
    execute 'create policy "Members can update their own avatar images" on storage.objects for update to authenticated using (bucket_id = ''avatars'' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = ''avatars'' and (storage.foldername(name))[1] = (select auth.uid())::text);';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Members can delete their own avatar images'
  ) then
    execute 'create policy "Members can delete their own avatar images" on storage.objects for delete to authenticated using (bucket_id = ''avatars'' and (storage.foldername(name))[1] = (select auth.uid())::text);';
  end if;
end $$;