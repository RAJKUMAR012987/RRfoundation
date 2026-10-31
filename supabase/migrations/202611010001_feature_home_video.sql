alter table public.site_content
  add column if not exists home_featured boolean not null default false;

create unique index if not exists site_content_single_home_featured_video
  on public.site_content (home_featured)
  where home_featured;

create or replace function public.clear_unpublished_home_featured_video()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.published then
    new.home_featured := false;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_unpublished_home_featured_video on public.site_content;
create trigger clear_unpublished_home_featured_video
  before insert or update of published on public.site_content
  for each row
  execute function public.clear_unpublished_home_featured_video();

create or replace function public.set_home_featured_video(p_content_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'Only site administrators can select the Home video.'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('public.site_content.home_featured')::bigint
  );

  if p_content_id is not null and not exists (
    select 1
    from public.site_content
    where id = p_content_id
      and kind = 'video'
      and published
  ) then
    raise exception 'Select a published video to feature on Home.'
      using errcode = '22023';
  end if;

  update public.site_content
  set home_featured = false
  where home_featured;

  if p_content_id is not null then
    update public.site_content
    set home_featured = true
    where id = p_content_id;
  end if;
end;
$$;

revoke all on function public.set_home_featured_video(uuid) from public;
grant execute on function public.set_home_featured_video(uuid) to authenticated;

revoke all on function public.clear_unpublished_home_featured_video() from public;
