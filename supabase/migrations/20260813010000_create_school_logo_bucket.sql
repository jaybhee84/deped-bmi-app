insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-logo', 'school-logo', true, 5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set name = excluded.name, public = excluded.public,
file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists school_logo_public_read on storage.objects;
create policy school_logo_public_read on storage.objects
for select to public using (bucket_id = 'school-logo');

drop policy if exists school_logo_authenticated_insert on storage.objects;
create policy school_logo_authenticated_insert on storage.objects
for insert to authenticated with check (bucket_id = 'school-logo');

drop policy if exists school_logo_authenticated_update on storage.objects;
create policy school_logo_authenticated_update on storage.objects
for update to authenticated using (bucket_id = 'school-logo') with check (bucket_id = 'school-logo');

drop policy if exists school_logo_authenticated_delete on storage.objects;
create policy school_logo_authenticated_delete on storage.objects
for delete to authenticated using (bucket_id = 'school-logo');
