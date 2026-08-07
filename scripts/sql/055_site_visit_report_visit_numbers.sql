-- ============================================================
-- Stable per-Site-Visit Stage Report Visit Numbers
--
-- Stage Report Visit Numbers are project-scoped. A scheduled Site Visit now
-- reserves one stable number so multiple visits for the same project can be
-- reported independently and the exact Site Visit <-> Report relationship
-- remains unambiguous.
-- ============================================================

alter table public.site_visit_requests
  add column if not exists report_visit_number integer;

DO $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'site_visit_requests_report_visit_number_positive'
      and conrelid = 'public.site_visit_requests'::regclass
  ) then
    alter table public.site_visit_requests
      add constraint site_visit_requests_report_visit_number_positive
      check (report_visit_number is null or report_visit_number > 0);
  end if;
end $$;

-- First preserve every number already owned by a real linked Stage Report.
-- These numbers are historical/canonical and must never be renumbered.
update public.site_visit_requests visit
set report_visit_number = response.visit_number
from public.term_responses response
where response.site_visit_request_id = visit.id
  and response.project_id = visit.project_id
  and response.visit_number > 0
  and visit.report_visit_number is null;

-- A project-scoped report number is intended to identify one report occurrence.
-- Refuse to invent a repair if already-linked historical reports contradict that
-- invariant; those rows require deliberate manual reconciliation.
DO $$
begin
  if exists (
    select visit.project_id, visit.report_visit_number
    from public.site_visit_requests visit
    where visit.report_visit_number is not null
    group by visit.project_id, visit.report_visit_number
    having count(*) > 1
  ) then
    raise exception 'Existing linked Site Visits contain duplicate project Visit Numbers; reconcile those historical rows before applying migration 055';
  end if;
end $$;

-- Backfill unreported scheduled/completed Site Visits in deterministic scheduled
-- date/time order. Existing Report numbers stay fixed; new obligations continue
-- after the highest number already used/reserved in that project.
DO $$
declare
  target record;
  next_number integer;
begin
  for target in
    select visit.id, visit.project_id
    from public.site_visit_requests visit
    where visit.status in ('scheduled', 'completed')
      and visit.report_visit_number is null
    order by
      visit.project_id,
      visit.scheduled_date asc nulls last,
      visit.scheduled_time asc nulls last,
      visit.created_at asc,
      visit.id asc
  loop
    perform pg_advisory_xact_lock(hashtextextended(target.project_id::text, 0));

    select coalesce(max(number_value), 0) + 1
      into next_number
    from (
      select response.visit_number as number_value
      from public.term_responses response
      where response.project_id = target.project_id
      union all
      select visit.report_visit_number as number_value
      from public.site_visit_requests visit
      where visit.project_id = target.project_id
        and visit.report_visit_number is not null
    ) numbers;

    update public.site_visit_requests
    set report_visit_number = next_number
    where id = target.id
      and report_visit_number is null;
  end loop;
end $$;

create unique index if not exists site_visit_requests_project_report_visit_unique
  on public.site_visit_requests(project_id, report_visit_number)
  where report_visit_number is not null;

create index if not exists site_visit_requests_project_report_visit_idx
  on public.site_visit_requests(project_id, report_visit_number)
  where report_visit_number is not null;

-- Reserve a number when a Site Visit first becomes scheduled. The same
-- project-scoped advisory lock used by Stage Report numbering prevents two
-- concurrent scheduling operations from reserving the same number.
create or replace function public.assign_site_visit_report_visit_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_number integer;
begin
  if tg_op = 'UPDATE' and old.report_visit_number is not null then
    -- Once assigned, the Site Visit number is stable. In particular it must not
    -- change after a Report has used it or when the visit becomes Completed.
    new.report_visit_number := old.report_visit_number;
    return new;
  end if;

  if new.status not in ('scheduled', 'completed') then
    new.report_visit_number := null;
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.project_id::text, 0));

  select coalesce(max(number_value), 0) + 1
    into next_number
  from (
    select response.visit_number as number_value
    from public.term_responses response
    where response.project_id = new.project_id
    union all
    select visit.report_visit_number as number_value
    from public.site_visit_requests visit
    where visit.project_id = new.project_id
      and visit.report_visit_number is not null
      and (tg_op <> 'UPDATE' or visit.id <> new.id)
  ) numbers;

  new.report_visit_number := next_number;
  return new;
end;
$$;

revoke all on function public.assign_site_visit_report_visit_number() from public;

drop trigger if exists site_visit_requests_assign_report_visit_number on public.site_visit_requests;
create trigger site_visit_requests_assign_report_visit_number
  before insert or update of status, project_id, report_visit_number
  on public.site_visit_requests
  for each row execute function public.assign_site_visit_report_visit_number();

-- Keep the canonical Stage Report numbering trigger, but when a Report is linked
-- to a Site Visit it MUST inherit that Site Visit's reserved number. Unlinked
-- reports continue using the same project-wide sequence and skip numbers already
-- reserved by scheduled Site Visits.
create or replace function public.assign_project_report_visit_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_project_id uuid;
  linked_visit_number integer;
  next_number integer;
begin
  if tg_op = 'UPDATE' then
    new.visit_number := old.visit_number;
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.project_id::text, 0));

  if new.site_visit_request_id is not null then
    select visit.project_id, visit.report_visit_number
      into linked_project_id, linked_visit_number
    from public.site_visit_requests visit
    where visit.id = new.site_visit_request_id;

    if linked_project_id is null or linked_project_id <> new.project_id then
      raise exception 'Linked Site Visit does not belong to the Report project';
    end if;
    if linked_visit_number is null or linked_visit_number <= 0 then
      raise exception 'Linked Site Visit does not have a reserved Report Visit Number';
    end if;
    if exists (
      select 1
      from public.term_responses response
      where response.project_id = new.project_id
        and response.visit_number = linked_visit_number
        and response.site_visit_request_id is distinct from new.site_visit_request_id
    ) then
      raise exception using errcode = '23505', message = 'The linked Site Visit Report Visit Number is already used by another Report';
    end if;

    new.visit_number := linked_visit_number;
    return new;
  end if;

  select coalesce(max(number_value), 0) + 1
    into next_number
  from (
    select response.visit_number as number_value
    from public.term_responses response
    where response.project_id = new.project_id
    union all
    select visit.report_visit_number as number_value
    from public.site_visit_requests visit
    where visit.project_id = new.project_id
      and visit.report_visit_number is not null
  ) numbers;

  new.visit_number := next_number;
  return new;
end;
$$;

revoke all on function public.assign_project_report_visit_number() from public;

-- The trigger names are preserved from migration 042; only their source logic is
-- strengthened to honor Site Visit reservations.
drop trigger if exists term_responses_assign_project_visit_number on public.term_responses;
create trigger term_responses_assign_project_visit_number
  before insert on public.term_responses
  for each row execute function public.assign_project_report_visit_number();

drop trigger if exists term_responses_preserve_visit_number on public.term_responses;
create trigger term_responses_preserve_visit_number
  before update of visit_number on public.term_responses
  for each row execute function public.assign_project_report_visit_number();

create unique index if not exists term_responses_linked_project_visit_unique
  on public.term_responses(project_id, visit_number)
  where site_visit_request_id is not null;

comment on column public.site_visit_requests.report_visit_number is
  'Stable project-scoped Stage Report Visit Number reserved for this scheduled Site Visit.';

comment on function public.assign_site_visit_report_visit_number() is
  'Reserves one stable project-scoped Stage Report Visit Number when a Site Visit becomes scheduled.';

comment on function public.assign_project_report_visit_number() is
  'Assigns immutable project-scoped Stage Report Visit Numbers and reuses a linked Site Visit reservation when present.';
