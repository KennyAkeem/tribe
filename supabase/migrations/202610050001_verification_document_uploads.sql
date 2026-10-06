alter table public.verification_requests
  add column id_front_path text,
  add column id_back_path text,
  add constraint verification_document_paths_pair
    check ((id_front_path is null) = (id_back_path is null));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-documents',
  'verification-documents',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;