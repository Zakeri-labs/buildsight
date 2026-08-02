-- Contract and financial information for the existing project create/edit flow.
alter table public.projects
  add column if not exists structure_supervision_fee numeric(14,3),
  add column if not exists finishing_supervision_fee numeric(14,3),
  add column if not exists received_amount numeric(14,3),
  add column if not exists outstanding_amount numeric(14,3),
  add column if not exists next_payment_amount numeric(14,3),
  add column if not exists next_payment_due_date date,
  add column if not exists invoice_reference_payment_note text,
  add column if not exists initial_remarks text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_structure_supervision_fee_nonnegative'
  ) then
    alter table public.projects add constraint projects_structure_supervision_fee_nonnegative
      check (structure_supervision_fee is null or structure_supervision_fee >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_finishing_supervision_fee_nonnegative'
  ) then
    alter table public.projects add constraint projects_finishing_supervision_fee_nonnegative
      check (finishing_supervision_fee is null or finishing_supervision_fee >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_received_amount_nonnegative'
  ) then
    alter table public.projects add constraint projects_received_amount_nonnegative
      check (received_amount is null or received_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_outstanding_amount_nonnegative'
  ) then
    alter table public.projects add constraint projects_outstanding_amount_nonnegative
      check (outstanding_amount is null or outstanding_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_next_payment_amount_nonnegative'
  ) then
    alter table public.projects add constraint projects_next_payment_amount_nonnegative
      check (next_payment_amount is null or next_payment_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_invoice_reference_payment_note_length'
  ) then
    alter table public.projects add constraint projects_invoice_reference_payment_note_length
      check (invoice_reference_payment_note is null or char_length(invoice_reference_payment_note) <= 250);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_initial_remarks_length'
  ) then
    alter table public.projects add constraint projects_initial_remarks_length
      check (initial_remarks is null or char_length(initial_remarks) <= 2000);
  end if;
end;
$$;
