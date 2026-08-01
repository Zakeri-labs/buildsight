-- ============================================================
-- Initial project documents archive
-- Separates Add Project reference files from correspondence records.
-- ============================================================

create table if not exists public.initial_docs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_name text not null,
  original_file_name text not null,
  file_path text not null,
  storage_bucket text not null default 'initial-docs',
  mime_type text,
  file_size bigint not null,
  category text not null default 'other',
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint initial_docs_file_name_not_blank check (length(btrim(file_name)) > 0),
  constraint initial_docs_original_name_not_blank check (length(btrim(original_file_name)) > 0),
  constraint initial_docs_file_path_not_blank check (length(btrim(file_path)) > 0),
  constraint initial_docs_file_size_nonnegative check (file_size >= 0),
  constraint initial_docs_bucket_check check (storage_bucket = 'initial-docs'),
  constraint initial_docs_project_path_check check (split_part(file_path, '/', 1) = project_id::text),
  constraint initial_docs_category_check check (category in (
    'contract',
    'approved_drawings',
    'specifications',
    'boq',
    'tender_documents',
    'permits_approvals',
    'scope_of_work',
    'project_brief',
    'consultant_agreement',
    'contractor_agreement',
    'initial_site_reports',
    'other'
  ))
);

create unique index if not exists initial_docs_file_path_unique on public.initial_docs (file_path);
create index if not exists initial_docs_project_idx on public.initial_docs (project_id);
create index if not exists initial_docs_project_category_idx on public.initial_docs (project_id, category);
create index if not exists initial_docs_created_idx on public.initial_docs (created_at desc);

create or replace function public.touch_initial_doc_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists initial_docs_touch_updated_at on public.initial_docs;
create trigger initial_docs_touch_updated_at
  before update on public.initial_docs
  for each row execute function public.touch_initial_doc_updated_at();

alter table public.initial_docs enable row level security;

drop policy if exists initial_docs_select on public.initial_docs;
create policy initial_docs_select on public.initial_docs for select
  using (
    public.is_project_member(project_id)
    or public.is_supervising_org_admin(project_id)
  );

drop policy if exists initial_docs_insert on public.initial_docs;
create policy initial_docs_insert on public.initial_docs for insert
  with check (
    uploaded_by = auth.uid()
    and storage_bucket = 'initial-docs'
    and split_part(file_path, '/', 1) = project_id::text
    and split_part(file_path, '/', 2) = auth.uid()::text
    and (
      public.is_project_member(project_id)
      or public.is_supervising_org_admin(project_id)
    )
  );

drop policy if exists initial_docs_update on public.initial_docs;
drop policy if exists initial_docs_delete on public.initial_docs;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'initial-docs',
  'initial-docs',
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

create or replace function public.initial_doc_project_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public, storage
as $$
declare
  folders text[];
begin
  folders := storage.foldername(object_name);
  if coalesce(array_length(folders, 1), 0) < 3 then
    return null;
  end if;
  return folders[1]::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

drop policy if exists initial_docs_storage_select on storage.objects;
create policy initial_docs_storage_select on storage.objects for select
  using (
    bucket_id = 'initial-docs'
    and array_length(storage.foldername(name), 1) >= 3
    and (
      public.is_project_member(public.initial_doc_project_id(name))
      or public.is_supervising_org_admin(public.initial_doc_project_id(name))
    )
  );

drop policy if exists initial_docs_storage_insert on storage.objects;
create policy initial_docs_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'initial-docs'
    and array_length(storage.foldername(name), 1) >= 3
    and (storage.foldername(name))[2] = auth.uid()::text
    and (
      public.is_project_member(public.initial_doc_project_id(name))
      or public.is_supervising_org_admin(public.initial_doc_project_id(name))
    )
  );

drop policy if exists initial_docs_storage_update on storage.objects;
create policy initial_docs_storage_update on storage.objects for update
  using (
    bucket_id = 'initial-docs'
    and array_length(storage.foldername(name), 1) >= 3
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_project_admin(public.initial_doc_project_id(name))
    )
    and (
      public.is_project_member(public.initial_doc_project_id(name))
      or public.is_supervising_org_admin(public.initial_doc_project_id(name))
    )
  )
  with check (
    bucket_id = 'initial-docs'
    and array_length(storage.foldername(name), 1) >= 3
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_project_admin(public.initial_doc_project_id(name))
    )
    and (
      public.is_project_member(public.initial_doc_project_id(name))
      or public.is_supervising_org_admin(public.initial_doc_project_id(name))
    )
  );

drop policy if exists initial_docs_storage_delete on storage.objects;
create policy initial_docs_storage_delete on storage.objects for delete
  using (
    bucket_id = 'initial-docs'
    and array_length(storage.foldername(name), 1) >= 3
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_project_admin(public.initial_doc_project_id(name))
    )
    and (
      public.is_project_member(public.initial_doc_project_id(name))
      or public.is_supervising_org_admin(public.initial_doc_project_id(name))
    )
  );

comment on table public.initial_docs is
  'Private initial project reference files uploaded during the Add Project workflow. Correspondence remains in public.documents.';
