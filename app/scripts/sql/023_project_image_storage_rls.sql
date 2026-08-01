-- ============================================================
-- Project image Storage RLS repair
-- Supports both project creation and existing-project gallery uploads while
-- keeping the project-images bucket private.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-images',
  'project-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Deliberately performs the permission lookup inside a SECURITY DEFINER helper.
-- Storage policies run against storage.objects, so direct joins through normal
-- table RLS can otherwise reject a valid upload immediately after project
-- creation even though the active project membership already exists.
create or replace function public.can_manage_project_image_storage(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
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

create or replace function public.can_view_project_image_storage(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
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

create or replace function public.can_upload_project_image_object(p_object_name text)
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
begin
  if auth.uid() is null or p_object_name is null or position('..' in p_object_name) > 0 then
    return false;
  end if;

  v_project_id := public.project_image_project_id(p_object_name);
  v_actor_id := split_part(p_object_name, '/', 2);
  v_folder := split_part(p_object_name, '/', 3);

  if v_project_id is null
     or v_actor_id <> auth.uid()::text
     or v_folder not in ('cover', 'gallery')
     or nullif(split_part(p_object_name, '/', 4), '') is null then
    return false;
  end if;

  return public.can_manage_project_image_storage(v_project_id);
end;
$$;

revoke all on function public.can_manage_project_image_storage(uuid) from public;
revoke all on function public.can_manage_project_image_storage(uuid) from anon;
grant execute on function public.can_manage_project_image_storage(uuid) to authenticated, service_role;

revoke all on function public.can_view_project_image_storage(uuid) from public;
revoke all on function public.can_view_project_image_storage(uuid) from anon;
grant execute on function public.can_view_project_image_storage(uuid) to authenticated, service_role;

revoke all on function public.can_upload_project_image_object(text) from public;
revoke all on function public.can_upload_project_image_object(text) from anon;
grant execute on function public.can_upload_project_image_object(text) to authenticated, service_role;

-- Replace the historical policies by name so this migration is safe to rerun.
-- SELECT is required by Supabase Storage when an idempotent retry uses upsert.
drop policy if exists project_images_select on storage.objects;
create policy project_images_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-images'
  and public.can_view_project_image_storage(public.project_image_project_id(name))
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

-- Retries use an idempotent path and x-upsert=true. The UPDATE policy must
-- enforce the same project/user/path checks as INSERT.
drop policy if exists project_images_update on storage.objects;
create policy project_images_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'project-images'
  and public.can_manage_project_image_storage(public.project_image_project_id(name))
)
with check (
  bucket_id = 'project-images'
  and public.can_upload_project_image_object(name)
);

-- Allows project managers to clean up partial uploads and remove gallery files.
drop policy if exists project_images_delete on storage.objects;
create policy project_images_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-images'
  and public.can_manage_project_image_storage(public.project_image_project_id(name))
);

comment on function public.can_view_project_image_storage(uuid) is
  'Checks active project membership or supervising-organization org_admin permission for private project image reads.';
comment on function public.can_manage_project_image_storage(uuid) is
  'Checks active project_admin or supervising-organization org_admin permission for private project image Storage operations.';
comment on function public.can_upload_project_image_object(text) is
  'Validates project-images paths as <projectId>/<auth.uid()>/cover|gallery/<filename> and checks active management permission.';
