-- ============================================================
-- Project documents and embedded editor images
-- ============================================================

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  reference text not null,
  title text not null,
  document_type text not null default 'general' check (document_type in ('general', 'drawing', 'submittal', 'report', 'contract')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  content jsonb not null default '{"type":"doc","version":1,"content":[]}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists documents_reference_unique on public.documents (reference);
create index if not exists documents_project_idx on public.documents (project_id);
create index if not exists documents_updated_idx on public.documents (updated_at desc);

create or replace function public.set_document_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.reference is null or btrim(new.reference) = '' then
    new.reference := 'DOC-' || upper(substr(replace(new.id::text, '-', ''), 1, 12));
  end if;
  new.updated_at := now();
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  elsif new.status = 'draft' then
    new.published_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists documents_set_defaults on public.documents;
create trigger documents_set_defaults
before insert or update on public.documents
for each row execute function public.set_document_defaults();

alter table public.documents enable row level security;

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select
  using (
    public.is_project_member(project_id)
    or public.is_supervising_org_admin(project_id)
  );

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert
  with check (
    created_by = auth.uid()
    and (
      public.is_project_member(project_id)
      or public.is_supervising_org_admin(project_id)
    )
  );

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update
  using (
    (
      public.is_project_member(project_id)
      or public.is_supervising_org_admin(project_id)
    )
    and (
      created_by = auth.uid()
      or public.is_project_admin(project_id)
    )
  )
  with check (
    (
      public.is_project_member(project_id)
      or public.is_supervising_org_admin(project_id)
    )
    and (
      created_by = auth.uid()
      or public.is_project_admin(project_id)
    )
  );

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete
  using (
    (
      public.is_project_member(project_id)
      or public.is_supervising_org_admin(project_id)
    )
    and (
      created_by = auth.uid()
      or public.is_project_admin(project_id)
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'document-images',
  'document-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Object paths use: <project_id>/<user_id>/<unique-file-name>
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
