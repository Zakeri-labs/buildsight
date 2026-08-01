-- ============================================================
-- Project creation assignments and owner ID card metadata
-- ============================================================

alter table public.projects
  add column if not exists assigned_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_supervisor_id uuid references public.profiles(id) on delete set null;

create index if not exists projects_assigned_user_idx
  on public.projects (assigned_user_id)
  where assigned_user_id is not null;

create index if not exists projects_assigned_supervisor_idx
  on public.projects (assigned_supervisor_id)
  where assigned_supervisor_id is not null;

alter table public.project_owners
  add column if not exists id_card_storage_path text,
  add column if not exists id_card_original_filename text,
  add column if not exists id_card_mime_type text,
  add column if not exists id_card_size_bytes bigint,
  add column if not exists id_card_uploaded_by uuid references public.profiles(id) on delete set null,
  add column if not exists id_card_uploaded_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.project_owners'::regclass
      and conname = 'project_owners_id_card_size_check'
  ) then
    alter table public.project_owners
      add constraint project_owners_id_card_size_check
      check (id_card_size_bytes is null or id_card_size_bytes between 0 and 10485760);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.project_owners'::regclass
      and conname = 'project_owners_id_card_metadata_check'
  ) then
    alter table public.project_owners
      add constraint project_owners_id_card_metadata_check
      check (
        id_card_storage_path is null
        or (
          id_card_original_filename is not null
          and id_card_mime_type is not null
          and id_card_size_bytes is not null
          and id_card_uploaded_by is not null
          and id_card_uploaded_at is not null
        )
      );
  end if;
end;
$$;

create unique index if not exists project_owners_id_card_storage_path_unique
  on public.project_owners (id_card_storage_path)
  where id_card_storage_path is not null;

comment on column public.projects.assigned_user_id is
  'Primary project user selected during guided project creation.';
comment on column public.projects.assigned_supervisor_id is
  'Primary project supervisor selected during guided project creation.';
comment on column public.project_owners.id_card_storage_path is
  'Private document-images Storage path for the owner ID card uploaded after project creation.';
