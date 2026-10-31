create table if not exists public.admin_emails (
  email text primary key,
  created_at timestamptz not null default now(),
  constraint admin_emails_lowercase check (email = lower(email))
);

alter table public.admin_emails enable row level security;
revoke all on public.admin_emails from anon, authenticated;

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_site_admin() from public;
grant execute on function public.is_site_admin() to anon, authenticated;

create table if not exists public.donation_payments (
  payment_id text primary key,
  order_id text,
  amount bigint not null check (amount >= 0),
  currency text not null,
  status text not null,
  method text,
  donor_email text,
  category text,
  paid_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.donation_payments enable row level security;
revoke all on public.donation_payments from anon, authenticated;
grant select on public.donation_payments to authenticated;
grant insert, update on public.donation_payments to service_role;

create policy "Site admins can read donation payments"
  on public.donation_payments
  for select
  to authenticated
  using (public.is_site_admin());

create table if not exists public.site_content (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('photo', 'video', 'quote')),
  title text not null check (length(trim(title)) between 1 and 160),
  description text check (description is null or length(description) <= 2000),
  quote text check (quote is null or length(quote) <= 2000),
  media_path text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  constraint quote_content_required check (kind <> 'quote' or quote is not null),
  constraint media_content_required check (
    (kind = 'quote' and media_path is null)
    or (kind in ('photo', 'video') and media_path is not null)
  )
);

alter table public.site_content enable row level security;
revoke all on public.site_content from anon, authenticated;
grant select on public.site_content to anon, authenticated;
grant insert, update, delete on public.site_content to authenticated;

create policy "Anyone can read published site content"
  on public.site_content
  for select
  to anon, authenticated
  using (published or public.is_site_admin());

create policy "Site admins can add site content"
  on public.site_content
  for insert
  to authenticated
  with check (public.is_site_admin());

create policy "Site admins can update site content"
  on public.site_content
  for update
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

create policy "Site admins can delete site content"
  on public.site_content
  for delete
  to authenticated
  using (public.is_site_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-media',
  'public-media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Anyone can view published media"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'public-media'
    and (
      public.is_site_admin()
      or exists (
        select 1
        from public.site_content
        where site_content.media_path = storage.objects.name
          and site_content.published
      )
    )
  );

create policy "Site admins can upload media"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'public-media' and public.is_site_admin());

create policy "Site admins can update media"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'public-media' and public.is_site_admin())
  with check (bucket_id = 'public-media' and public.is_site_admin());

create policy "Site admins can delete media"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'public-media' and public.is_site_admin());

-- After creating the admin user in Supabase Auth, authorize it with:
-- insert into public.admin_emails (email) values (lower('admin@example.com'));
