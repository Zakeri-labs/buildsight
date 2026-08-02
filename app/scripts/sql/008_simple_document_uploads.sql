-- ============================================================
-- Simple project document uploads using the existing document model
-- and private document-images storage bucket.
-- ============================================================

alter table public.documents
  add column if not exists creation_mode text not null default 'advanced',
  add column if not exists simple_upload_category text,
  add column if not exists file_storage_path text,
  add column if not exists original_filename text,
  add column if not exists file_mime_type text,
  add column if not exists file_size_bytes bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_creation_mode_check'
  ) then
    alter table public.documents
      add constraint documents_creation_mode_check
      check (creation_mode in ('advanced', 'simple'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_file_size_check'
  ) then
    alter table public.documents
      add constraint documents_file_size_check
      check (file_size_bytes is null or file_size_bytes >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_simple_file_check'
  ) then
    alter table public.documents
      add constraint documents_simple_file_check
      check (
        creation_mode = 'advanced'
        or (
          simple_upload_category is not null
          and file_storage_path is not null
          and original_filename is not null
          and file_size_bytes is not null
        )
      );
  end if;
end;
$$;

create index if not exists documents_simple_category_idx
  on public.documents (project_id, simple_upload_category)
  where simple_upload_category is not null;

create unique index if not exists documents_file_storage_path_unique
  on public.documents (file_storage_path)
  where file_storage_path is not null;

comment on column public.documents.creation_mode is
  'Document creation mode: advanced rich text or simple file upload.';
comment on column public.documents.simple_upload_category is
  'Stable machine-readable category from the application simple upload registry.';
comment on column public.documents.file_storage_path is
  'Private Supabase Storage object path in the document-images bucket.';

-- Reuse and expand the existing private storage bucket so both embedded editor
-- images and quick-upload project files share the same project-scoped policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'document-images',
  'document-images',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
    'image/vnd.dwg',
    'image/x-dwg',
    'application/acad',
    'application/dxf',
    'image/vnd.dxf'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- The existing document_images_select/insert/update/delete policies from
-- 006_documents.sql already scope every object by project membership and
-- uploader/admin permissions. Quick-upload paths use the same
-- <project_id>/<user_id>/... convention, so no broader access is introduced.

-- Reassert the existing project-scoped Storage policies for the shared bucket.
create or replace function public.document_image_project_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public, storage
as $$
declare
  folders text[];
begin
  folders := storage.foldername(object_name);
  if coalesce(array_length(folders, 1), 0) < 2 then
    return null;
  end if;
  return folders[1]::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

drop policy if exists document_images_select on storage.objects;
create policy document_images_select on storage.objects for select
  using (
    bucket_id = 'document-images'
    and array_length(storage.foldername(name), 1) >= 2
    and (
      public.is_project_member(public.document_image_project_id(name))
      or public.is_supervising_org_admin(public.document_image_project_id(name))
    )
  );

drop policy if exists document_images_insert on storage.objects;
create policy document_images_insert on storage.objects for insert
  with check (
    bucket_id = 'document-images'
    and array_length(storage.foldername(name), 1) >= 2
    and (storage.foldername(name))[2] = auth.uid()::text
    and (
      public.is_project_member(public.document_image_project_id(name))
      or public.is_supervising_org_admin(public.document_image_project_id(name))
    )
  );

drop policy if exists document_images_update on storage.objects;
create policy document_images_update on storage.objects for update
  using (
    bucket_id = 'document-images'
    and array_length(storage.foldername(name), 1) >= 2
    and (
      public.is_project_member(public.document_image_project_id(name))
      or public.is_supervising_org_admin(public.document_image_project_id(name))
    )
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_project_admin(public.document_image_project_id(name))
    )
  )
  with check (
    bucket_id = 'document-images'
    and array_length(storage.foldername(name), 1) >= 2
    and (
      public.is_project_member(public.document_image_project_id(name))
      or public.is_supervising_org_admin(public.document_image_project_id(name))
    )
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_project_admin(public.document_image_project_id(name))
    )
  );

drop policy if exists document_images_delete on storage.objects;
create policy document_images_delete on storage.objects for delete
  using (
    bucket_id = 'document-images'
    and array_length(storage.foldername(name), 1) >= 2
    and (
      public.is_project_member(public.document_image_project_id(name))
      or public.is_supervising_org_admin(public.document_image_project_id(name))
    )
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_project_admin(public.document_image_project_id(name))
    )
  );
