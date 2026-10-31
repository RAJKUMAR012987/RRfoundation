create table if not exists public.home_belief (
  id text primary key check (id = 'home'),
  eyebrow text not null check (length(trim(eyebrow)) between 1 and 80),
  heading text not null check (length(trim(heading)) between 1 and 240),
  body text not null check (length(trim(body)) between 1 and 1200),
  link_label text not null check (length(trim(link_label)) between 1 and 100),
  link_url text not null check (
    length(link_url) between 2 and 300
    and left(link_url, 1) = '/'
    and left(link_url, 2) <> '//'
    and position(chr(92) in link_url) = 0
  ),
  updated_at timestamptz not null default now()
);

alter table public.home_belief enable row level security;
revoke all on public.home_belief from anon, authenticated;
grant select on public.home_belief to anon, authenticated;
grant update on public.home_belief to authenticated;

create policy "Anyone can read the Home belief section"
  on public.home_belief
  for select
  to anon, authenticated
  using (id = 'home');

create policy "Site admins can update the Home belief section"
  on public.home_belief
  for update
  to authenticated
  using (id = 'home' and public.is_site_admin())
  with check (id = 'home' and public.is_site_admin());

insert into public.home_belief (id, eyebrow, heading, body, link_label, link_url)
values (
  'home',
  'Our belief',
  'People closest to the challenge belong at the heart of the solution.',
  'We listen first, then work side by side — because lasting progress is strongest when communities shape the decisions, priorities, and actions that affect their lives.',
  'Learn about our approach',
  '/about'
)
on conflict (id) do nothing;
