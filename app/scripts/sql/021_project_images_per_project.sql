-- ============================================================
-- One project image record per project
-- Keeps projects.image as a backwards-compatible mirror while making the
-- project_id relationship authoritative for new uploads and reads.
-- ============================================================


create or replace function public.normalize_project_image_storage_path(value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  candidate text;
  first_segment text;
begin
  if value is null or btrim(value) = '' then return null; end if;
  candidate := btrim(value);
  candidate := replace(replace(candidate, '%2F', '/'), '%2f', '/');

  if position('path=' in candidate) > 0 then
    candidate := split_part(split_part(candidate, 'path=', 2), '&', 1);
  elsif position('/project-images/' in candidate) > 0 then
    candidate := split_part(candidate, '/project-images/', 2);
  end if;

  candidate := split_part(candidate, '?', 1);
  candidate := regexp_replace(candidate, '^/+', '');
  if candidate like 'project-images/%' then
    candidate := substring(candidate from length('project-images/') + 1);
  end if;

  first_segment := split_part(candidate, '/', 1);
  perform first_segment::uuid;
  if position('/' in candidate) = 0 or position('..' in candidate) > 0 then return null; end if;
  return candidate;
exception when invalid_text_representation then
  return null;
end;
$$;

comment on function public.normalize_project_image_storage_path(text) is
  'Normalizes legacy project image paths and Supabase/API URLs into private project-images bucket paths.';

create table if not exists public.project_images (
  project_id uuid primary key references public.projects(id) on delete cascade,
  storage_path text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_images_storage_path_matches_project
    check (split_part(storage_path, '/', 1) = project_id::text)
);

comment on table public.project_images is
  'Authoritative one-to-one project cover image relation. Storage paths must begin with the owning project UUID.';
comment on column public.project_images.storage_path is
  'Private project-images bucket path. The first path segment must equal project_id.';

-- Preserve existing valid per-project image paths. Legacy external URLs remain
-- untouched in projects.image and continue to render through the application
-- fallback until they are replaced.
insert into public.project_images (project_id, storage_path, created_by, created_at, updated_at)
select
  project.id,
  public.normalize_project_image_storage_path(project.image),
  project.created_by,
  project.created_at,
  project.updated_at
from public.projects project
where public.normalize_project_image_storage_path(project.image) is not null
  and split_part(public.normalize_project_image_storage_path(project.image), '/', 1) = project.id::text
on conflict (project_id) do nothing;

create or replace function public.sync_project_image_legacy_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.projects set image = null, updated_at = now() where id = old.project_id;
    return old;
  end if;

  update public.projects
  set image = new.storage_path,
      updated_at = now()
  where id = new.project_id;
  return new;
end;
$$;

drop trigger if exists project_images_sync_legacy_column on public.project_images;
create trigger project_images_sync_legacy_column
after insert or update of storage_path or delete on public.project_images
for each row execute function public.sync_project_image_legacy_column();

alter table public.project_images enable row level security;

drop policy if exists project_images_records_select on public.project_images;
create policy project_images_records_select on public.project_images for select
using (
  public.is_project_member(project_id)
  or public.is_supervising_org_admin(project_id)
);

drop policy if exists project_images_records_insert on public.project_images;
create policy project_images_records_insert on public.project_images for insert
with check (
  public.is_project_admin(project_id)
  or public.is_supervising_org_admin(project_id)
);

drop policy if exists project_images_records_update on public.project_images;
create policy project_images_records_update on public.project_images for update
using (
  public.is_project_admin(project_id)
  or public.is_supervising_org_admin(project_id)
)
with check (
  public.is_project_admin(project_id)
  or public.is_supervising_org_admin(project_id)
);

drop policy if exists project_images_records_delete on public.project_images;
create policy project_images_records_delete on public.project_images for delete
using (
  public.is_project_admin(project_id)
  or public.is_supervising_org_admin(project_id)
);
