-- ============================================================
-- Construction document management enhancement
-- Preserves existing document rows and reuses project-scoped storage rules.
-- ============================================================

alter table public.documents
  add column if not exists short_description text,
  add column if not exists document_details text not null default '',
  add column if not exists workflow_status text not null default 'open';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_workflow_status_check'
  ) then
    alter table public.documents
      add constraint documents_workflow_status_check
      check (workflow_status in ('open', 'under_review', 'answered', 'approved', 'rejected', 'closed'));
  end if;
end;
$$;

comment on column public.documents.short_description is
  'Optional short description captured during construction document creation.';
comment on column public.documents.document_details is
  'Editable type-specific construction document narrative/template. No per-type columns are used.';
comment on column public.documents.workflow_status is
  'Extensible construction workflow status, separate from draft/published content state.';

create table if not exists public.document_reference_counters (
  document_type text not null,
  reference_year integer not null,
  last_value integer not null default 0,
  primary key (document_type, reference_year)
);

revoke all on table public.document_reference_counters from anon, authenticated;

create or replace function public.document_reference_prefix(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case value
    when 'ncr' then 'NCR'
    when 'request_for_information' then 'RFI'
    when 'wir_ir' then 'WIR'
    when 'material_inspection_request' then 'MIR'
    when 'ipc' then 'IPC'
    when 'variation_order' then 'VO'
    else 'DOC'
  end;
$$;

create or replace function public.set_document_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reference_prefix text;
  reference_year integer;
  next_number integer;
begin
  if new.reference is null or btrim(new.reference) = '' then
    reference_prefix := public.document_reference_prefix(new.document_type);
    reference_year := extract(year from coalesce(new.created_at, now()))::integer;

    insert into public.document_reference_counters (document_type, reference_year, last_value)
    values (reference_prefix, reference_year, 1)
    on conflict (document_type, reference_year)
    do update set last_value = public.document_reference_counters.last_value + 1
    returning last_value into next_number;

    new.reference := reference_prefix || '-' || reference_year::text || '-' || lpad(next_number::text, 3, '0');
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

create table if not exists public.document_attachments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  attachment_type text not null check (attachment_type in ('file', 'image')),
  storage_path text not null,
  original_filename text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes >= 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (storage_path)
);

create index if not exists document_attachments_document_idx
  on public.document_attachments (document_id, attachment_type, created_at desc);
create index if not exists document_attachments_project_idx
  on public.document_attachments (project_id);

alter table public.document_attachments enable row level security;

drop policy if exists document_attachments_select on public.document_attachments;
create policy document_attachments_select on public.document_attachments for select
  using (
    public.is_project_member(project_id)
    or public.is_supervising_org_admin(project_id)
  );

drop policy if exists document_attachments_insert on public.document_attachments;
create policy document_attachments_insert on public.document_attachments for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.documents d
      where d.id = document_id and d.project_id = project_id
    )
    and (
      public.is_project_member(project_id)
      or public.is_supervising_org_admin(project_id)
    )
  );

drop policy if exists document_attachments_delete on public.document_attachments;
create policy document_attachments_delete on public.document_attachments for delete
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

comment on table public.document_attachments is
  'Unlimited project-scoped file and image attachments for construction documents.';
