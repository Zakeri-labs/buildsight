-- ============================================================
-- AI document translation records and generated PDF storage
-- ============================================================

create table if not exists public.translation_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  project_stage_id uuid not null references public.project_stages(id) on delete cascade,
  project_stage_term_id uuid not null references public.project_stage_terms(id) on delete cascade,
  response_id uuid not null references public.term_responses(id) on delete cascade,
  original_content jsonb not null default '{}'::jsonb,
  translated_content jsonb,
  original_pdf_url text,
  arabic_pdf_url text,
  bilingual_pdf_url text,
  translation_status text not null default 'pending',
  created_by uuid not null references public.profiles(id) on delete restrict,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint translation_documents_status_check check (translation_status in ('pending','completed','failed'))
);

create unique index if not exists translation_documents_response_unique
  on public.translation_documents(response_id);
create index if not exists translation_documents_project_term_idx
  on public.translation_documents(project_id, project_stage_term_id, updated_at desc);
create index if not exists translation_documents_created_by_idx
  on public.translation_documents(created_by, created_at desc);

create or replace function public.touch_translation_document_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists translation_documents_touch_updated_at on public.translation_documents;
create trigger translation_documents_touch_updated_at
  before update on public.translation_documents
  for each row execute function public.touch_translation_document_updated_at();

alter table public.translation_documents enable row level security;

drop policy if exists translation_documents_select on public.translation_documents;
create policy translation_documents_select on public.translation_documents for select
  using (public.can_access_project_stage(project_id));

drop policy if exists translation_documents_insert on public.translation_documents;
create policy translation_documents_insert on public.translation_documents for insert
  with check (
    public.can_access_project_stage(project_id)
    and created_by = auth.uid()
  );

drop policy if exists translation_documents_update on public.translation_documents;
create policy translation_documents_update on public.translation_documents for update
  using (
    public.can_access_project_stage(project_id)
    and (
      created_by = auth.uid()
      or public.is_project_admin(project_id)
      or public.is_project_stage_reviewer(project_id)
    )
  )
  with check (
    public.can_access_project_stage(project_id)
    and (
      created_by = auth.uid()
      or public.is_project_admin(project_id)
      or public.is_project_stage_reviewer(project_id)
    )
  );

drop policy if exists translation_documents_delete on public.translation_documents;
create policy translation_documents_delete on public.translation_documents for delete
  using (created_by = auth.uid() or public.is_project_admin(project_id));

create or replace function public.stage_translation_project_id(object_name text)
returns uuid
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  first_segment text;
begin
  first_segment := split_part(object_name, '/', 1);
  if first_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return first_segment::uuid;
  end if;
  return null;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-stage-translations',
  'project-stage-translations',
  false,
  41943040,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists stage_translation_pdfs_select on storage.objects;
create policy stage_translation_pdfs_select on storage.objects for select to authenticated
using (
  bucket_id = 'project-stage-translations'
  and public.can_access_project_stage(public.stage_translation_project_id(name))
);

drop policy if exists stage_translation_pdfs_insert on storage.objects;
create policy stage_translation_pdfs_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'project-stage-translations'
  and public.can_access_project_stage(public.stage_translation_project_id(name))
);

drop policy if exists stage_translation_pdfs_update on storage.objects;
create policy stage_translation_pdfs_update on storage.objects for update to authenticated
using (
  bucket_id = 'project-stage-translations'
  and public.can_access_project_stage(public.stage_translation_project_id(name))
)
with check (
  bucket_id = 'project-stage-translations'
  and public.can_access_project_stage(public.stage_translation_project_id(name))
);

drop policy if exists stage_translation_pdfs_delete on storage.objects;
create policy stage_translation_pdfs_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'project-stage-translations'
  and (
    owner_id = auth.uid()::text
    or public.is_project_admin(public.stage_translation_project_id(name))
  )
);

revoke all on function public.touch_translation_document_updated_at() from public;
revoke all on function public.stage_translation_project_id(text) from public;
grant execute on function public.stage_translation_project_id(text) to authenticated, service_role;
