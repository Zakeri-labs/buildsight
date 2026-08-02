-- ============================================================
-- 024_project_image_storage_rls_repair.sql
-- Self-contained, idempotent Storage RLS repair for the ordered
-- project gallery introduced by 022_project_gallery_images.sql.
--
-- 022 relation:
--   public.project_images.id
--   public.project_images.project_id
--   public.project_images.storage_path
--   public.project_images.order_index
--
-- Supported private object paths:
--   <projectId>/<auth.uid()>/cover/<filename>
--   <projectId>/<auth.uid()>/gallery/<filename>
-- ============================================================

-- Keep the existing bucket private and preserve the supported image rules.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'project-images',
  'project-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Required by the Storage policies below. This is deliberately recreated here
-- so the migration does not depend on migration 015 having run successfully.
create or replace function public.project_image_project_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  candidate text;
begin
  if object_name is null or btrim(object_name) = '' then
    return null;
  end if;

  candidate := split_part(object_name, '/', 1);

  if candidate = '' then
    return null;
  end if;

  return candidate::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

comment on function public.project_image_project_id(text) is
  'Extracts the owning project UUID from a project-images Storage object path.';

-- Storage policies execute against storage.objects. SECURITY DEFINER avoids
-- unrelated table RLS blocking a valid permission lookup immediately after a
-- project has been created.
create or replace function public.can_manage_project_image_storage(
  p_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and p_project_id is not null
    and exists (
      select 1
      from public.projects project
      where project.id = p_project_id
        and (
          exists (
            select 1
            from public.project_user_memberships membership
            where membership.project_id = project.id
              and membership.user_id = auth.uid()
              and membership.status = 'active'
              and membership.access_role = 'project_admin'
          )
          or exists (
            select 1
            from public.organization_memberships membership
            where membership.organization_id = project.supervising_organization_id
              and membership.user_id = auth.uid()
              and membership.status = 'active'
              and membership.role = 'org_admin'
          )
        )
    );
$$;

create or replace function public.can_view_project_image_storage(
  p_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and p_project_id is not null
    and exists (
      select 1
      from public.projects project
      where project.id = p_project_id
        and (
          exists (
            select 1
            from public.project_user_memberships membership
            where membership.project_id = project.id
              and membership.user_id = auth.uid()
              and membership.status = 'active'
          )
          or exists (
            select 1
            from public.organization_memberships membership
            where membership.organization_id = project.supervising_organization_id
              and membership.user_id = auth.uid()
              and membership.status = 'active'
              and membership.role = 'org_admin'
          )
        )
    );
$$;

-- Validates the complete upload path before Storage accepts INSERT/UPSERT.
create or replace function public.can_upload_project_image_object(
  p_object_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
  v_actor_id text;
  v_folder text;
  v_file_name text;
begin
  if auth.uid() is null
     or p_object_name is null
     or btrim(p_object_name) = ''
     or position('..' in p_object_name) > 0 then
    return false;
  end if;

  v_project_id := public.project_image_project_id(p_object_name);
  v_actor_id := split_part(p_object_name, '/', 2);
  v_folder := split_part(p_object_name, '/', 3);
  v_file_name := split_part(p_object_name, '/', 4);

  if v_project_id is null
     or v_actor_id <> auth.uid()::text
     or v_folder not in ('cover', 'gallery')
     or nullif(v_file_name, '') is null
     or split_part(p_object_name, '/', 5) <> '' then
    return false;
  end if;

  return public.can_manage_project_image_storage(v_project_id);
end;
$$;

revoke all on function public.project_image_project_id(text) from public;
revoke all on function public.project_image_project_id(text) from anon;
grant execute on function public.project_image_project_id(text)
  to authenticated, service_role;

revoke all on function public.can_manage_project_image_storage(uuid) from public;
revoke all on function public.can_manage_project_image_storage(uuid) from anon;
grant execute on function public.can_manage_project_image_storage(uuid)
  to authenticated, service_role;

revoke all on function public.can_view_project_image_storage(uuid) from public;
revoke all on function public.can_view_project_image_storage(uuid) from anon;
grant execute on function public.can_view_project_image_storage(uuid)
  to authenticated, service_role;

revoke all on function public.can_upload_project_image_object(text) from public;
revoke all on function public.can_upload_project_image_object(text) from anon;
grant execute on function public.can_upload_project_image_object(text)
  to authenticated, service_role;

-- Recreate only the project-images Storage policies. Safe to rerun.
drop policy if exists project_images_select on storage.objects;
create policy project_images_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-images'
  and public.can_view_project_image_storage(
    public.project_image_project_id(name)
  )
);

drop policy if exists project_images_insert on storage.objects;
create policy project_images_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-images'
  and public.can_upload_project_image_object(name)
);

-- Supabase Storage upsert requires SELECT + UPDATE in addition to INSERT.
drop policy if exists project_images_update on storage.objects;
create policy project_images_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'project-images'
  and public.can_manage_project_image_storage(
    public.project_image_project_id(name)
  )
)
with check (
  bucket_id = 'project-images'
  and public.can_upload_project_image_object(name)
);

-- Project managers may remove prior uploads, including partial uploads made by
-- another authorised manager, as long as the object belongs to that project.
drop policy if exists project_images_delete on storage.objects;
create policy project_images_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-images'
  and public.can_manage_project_image_storage(
    public.project_image_project_id(name)
  )
);

comment on function public.can_manage_project_image_storage(uuid) is
  'Allows an active project_admin or supervising-organisation org_admin to manage private project images.';

comment on function public.can_view_project_image_storage(uuid) is
  'Allows active project members and supervising-organisation org_admins to view private project images.';

comment on function public.can_upload_project_image_object(text) is
  'Validates <projectId>/<auth.uid()>/cover|gallery/<filename> and project image management permission.';
