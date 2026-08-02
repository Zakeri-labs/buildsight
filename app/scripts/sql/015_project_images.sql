-- ============================================================
-- Optional project cover images
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
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.project_image_project_id(object_name text)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  candidate text;
begin
  candidate := split_part(object_name, '/', 1);
  if candidate = '' then return null; end if;
  return candidate::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

drop policy if exists project_images_select on storage.objects;
create policy project_images_select on storage.objects for select
  using (
    bucket_id = 'project-images'
    and (
      public.is_project_member(public.project_image_project_id(name))
      or public.is_supervising_org_admin(public.project_image_project_id(name))
    )
  );

drop policy if exists project_images_insert on storage.objects;
create policy project_images_insert on storage.objects for insert
  with check (
    bucket_id = 'project-images'
    and split_part(name, '/', 2) = auth.uid()::text
    and (
      public.is_project_member(public.project_image_project_id(name))
      or public.is_supervising_org_admin(public.project_image_project_id(name))
    )
  );

drop policy if exists project_images_update on storage.objects;
create policy project_images_update on storage.objects for update
  using (
    bucket_id = 'project-images'
    and (
      public.is_project_admin(public.project_image_project_id(name))
      or public.is_supervising_org_admin(public.project_image_project_id(name))
    )
  )
  with check (
    bucket_id = 'project-images'
    and (
      public.is_project_admin(public.project_image_project_id(name))
      or public.is_supervising_org_admin(public.project_image_project_id(name))
    )
  );

drop policy if exists project_images_delete on storage.objects;
create policy project_images_delete on storage.objects for delete
  using (
    bucket_id = 'project-images'
    and (
      public.is_project_admin(public.project_image_project_id(name))
      or public.is_supervising_org_admin(public.project_image_project_id(name))
    )
  );

comment on function public.project_image_project_id(text) is
  'Extracts the project UUID from project-images object paths.';
