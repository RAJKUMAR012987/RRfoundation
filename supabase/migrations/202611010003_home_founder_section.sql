create table if not exists public.home_founders (
  id text primary key check (id = 'home'),
  message text not null default '' check (length(message) <= 1200),
  founder_name text not null default '' check (length(founder_name) <= 120),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 4),
  updated_at timestamptz not null default now()
);

alter table public.home_founders enable row level security;
revoke all on public.home_founders from anon, authenticated;
grant select on public.home_founders to anon, authenticated;
grant update on public.home_founders to authenticated;

create policy "Anyone can read the Home founder section"
  on public.home_founders
  for select
  to anon, authenticated
  using (id = 'home');

create policy "Site admins can update the Home founder section"
  on public.home_founders
  for update
  to authenticated
  using (id = 'home' and public.is_site_admin())
  with check (id = 'home' and public.is_site_admin());

insert into public.home_founders (id)
values ('home')
on conflict (id) do nothing;

create policy "Anyone can view published Home founder photos"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'public-media'
    and exists (
      select 1
      from public.home_founders
      where home_founders.id = 'home'
        and storage.objects.name = any(home_founders.photo_paths)
    )
  );
