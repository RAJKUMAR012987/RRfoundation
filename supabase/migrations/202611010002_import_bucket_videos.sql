drop policy if exists "Site admins can list bucket media" on storage.objects;

create policy "Site admins can list bucket media"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'public-media' and public.is_site_admin());
