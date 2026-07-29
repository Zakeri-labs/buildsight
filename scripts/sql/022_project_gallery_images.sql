-- ============================================================
-- Project gallery images
-- Extends the existing project_images cover relation into an ordered gallery.
-- order_index = 0 is always the project cover image. projects.image remains a
-- backwards-compatible mirror for existing pages and integrations.
-- ============================================================

alter table public.project_images
  add column if not exists id uuid,
  add column if not exists order_index integer not null default 0;

update public.project_images
set id = gen_random_uuid()
where id is null;

alter table public.project_images
  alter column id set default gen_random_uuid(),
  alter column id set not null;

alter table public.project_images
  drop constraint if exists project_images_pkey;

alter table public.project_images
  add constraint project_images_pkey primary key (id);

alter table public.project_images
  drop constraint if exists project_images_order_index_nonnegative;

alter table public.project_images
  add constraint project_images_order_index_nonnegative check (order_index >= 0);

alter table public.project_images
  drop constraint if exists project_images_project_order_key;

alter table public.project_images
  add constraint project_images_project_order_key
  unique (project_id, order_index)
  deferrable initially deferred;

create index if not exists project_images_project_order_idx
  on public.project_images (project_id, order_index, created_at);

comment on table public.project_images is
  'Ordered project gallery. The image with order_index 0 is the project cover image.';
comment on column public.project_images.id is
  'Stable gallery image identifier.';
comment on column public.project_images.order_index is
  'Zero-based gallery order. Index 0 is mirrored to projects.image as the cover.';

-- Existing valid one-to-one records already have order_index 0. Also backfill
-- any valid legacy managed path that was not inserted by migration 021.
insert into public.project_images (project_id, storage_path, created_by, order_index, created_at, updated_at)
select
  project.id,
  public.normalize_project_image_storage_path(project.image),
  project.created_by,
  0,
  project.created_at,
  project.updated_at
from public.projects project
where public.normalize_project_image_storage_path(project.image) is not null
  and split_part(public.normalize_project_image_storage_path(project.image), '/', 1) = project.id::text
  and not exists (
    select 1 from public.project_images image where image.project_id = project.id
  )
on conflict (storage_path) do nothing;

create or replace function public.sync_project_image_legacy_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
  cover_path text;
begin
  if tg_op = 'DELETE' then
    target_project_id := old.project_id;
  else
    target_project_id := new.project_id;
  end if;

  select image.storage_path
  into cover_path
  from public.project_images image
  where image.project_id = target_project_id
  order by image.order_index asc, image.created_at asc, image.id asc
  limit 1;

  update public.projects
  set image = cover_path,
      updated_at = now()
  where id = target_project_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Recreate the existing trigger against the gallery-aware function.
drop trigger if exists project_images_sync_legacy_column on public.project_images;
create trigger project_images_sync_legacy_column
after insert or update of storage_path, order_index or delete on public.project_images
for each row execute function public.sync_project_image_legacy_column();

-- Service-role-only helper used by server actions to reorder all gallery rows in
-- one transaction. The deferrable unique constraint prevents temporary order
-- collisions while rows exchange positions.
create or replace function public.replace_project_gallery_order(
  p_project_id uuid,
  p_image_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_count integer;
  supplied_count integer;
  distinct_count integer;
  cover_path text;
begin
  select count(*) into expected_count
  from public.project_images
  where project_id = p_project_id;

  supplied_count := coalesce(array_length(p_image_ids, 1), 0);
  select count(distinct supplied.image_id) into distinct_count
  from unnest(coalesce(p_image_ids, array[]::uuid[])) as supplied(image_id);

  if expected_count <> supplied_count or supplied_count <> distinct_count then
    raise exception 'Gallery order must contain every project image exactly once.';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_image_ids, array[]::uuid[])) as supplied(image_id)
    left join public.project_images image
      on image.id = supplied.image_id
     and image.project_id = p_project_id
    where image.id is null
  ) then
    raise exception 'Gallery order contains an image from another project.';
  end if;

  update public.project_images image
  set order_index = (ordered.ordinality - 1)::integer,
      updated_at = now()
  from unnest(coalesce(p_image_ids, array[]::uuid[])) with ordinality as ordered(image_id, ordinality)
  where image.id = ordered.image_id
    and image.project_id = p_project_id;

  select image.storage_path into cover_path
  from public.project_images image
  where image.project_id = p_project_id
  order by image.order_index asc, image.created_at asc, image.id asc
  limit 1;

  update public.projects
  set image = cover_path,
      updated_at = now()
  where id = p_project_id;
end;
$$;

revoke all on function public.replace_project_gallery_order(uuid, uuid[]) from public;
revoke all on function public.replace_project_gallery_order(uuid, uuid[]) from anon;
revoke all on function public.replace_project_gallery_order(uuid, uuid[]) from authenticated;
grant execute on function public.replace_project_gallery_order(uuid, uuid[]) to service_role;

-- Delete one gallery row and compact the remaining order in the same database
-- transaction. The removed Storage path is returned so the server can delete
-- the object only after the relation update succeeds.
create or replace function public.delete_project_gallery_image(
  p_project_id uuid,
  p_image_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_path text;
  cover_path text;
begin
  delete from public.project_images
  where project_id = p_project_id
    and id = p_image_id
  returning storage_path into removed_path;

  if removed_path is null then
    raise exception 'Project gallery image not found.';
  end if;

  with ordered as (
    select image.id,
           (row_number() over (order by image.order_index asc, image.created_at asc, image.id asc) - 1)::integer as next_index
    from public.project_images image
    where image.project_id = p_project_id
  )
  update public.project_images image
  set order_index = ordered.next_index,
      updated_at = now()
  from ordered
  where image.id = ordered.id;

  select image.storage_path into cover_path
  from public.project_images image
  where image.project_id = p_project_id
  order by image.order_index asc, image.created_at asc, image.id asc
  limit 1;

  update public.projects
  set image = cover_path,
      updated_at = now()
  where id = p_project_id;

  return removed_path;
end;
$$;

revoke all on function public.delete_project_gallery_image(uuid, uuid) from public;
revoke all on function public.delete_project_gallery_image(uuid, uuid) from anon;
revoke all on function public.delete_project_gallery_image(uuid, uuid) from authenticated;
grant execute on function public.delete_project_gallery_image(uuid, uuid) to service_role;
