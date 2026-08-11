-- ============================================================
-- Persist project-validated Letter To / CC recipient snapshots
-- for the existing construction Letter workflow.
-- ============================================================

alter table public.documents
  add column if not exists letter_to_recipients jsonb not null default '[]'::jsonb,
  add column if not exists cc_recipients jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_letter_to_recipients_array_check'
  ) then
    alter table public.documents
      add constraint documents_letter_to_recipients_array_check
      check (jsonb_typeof(letter_to_recipients) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_cc_recipients_array_check'
  ) then
    alter table public.documents
      add constraint documents_cc_recipients_array_check
      check (jsonb_typeof(cc_recipients) = 'array');
  end if;
end;
$$;

comment on column public.documents.letter_to_recipients is
  'Project-validated snapshot list for primary Letter recipients. Participant IDs are validated against project_participants before insert.';
comment on column public.documents.cc_recipients is
  'Project-validated snapshot list for optional CC recipients. Participant IDs are validated against project_participants before insert.';
