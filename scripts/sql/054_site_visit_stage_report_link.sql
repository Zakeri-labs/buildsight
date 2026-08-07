-- ============================================================
-- Explicit Site Visit -> Stage-based Report relationship
--
-- A scheduled Site Visit and a Stage-based report previously had no
-- canonical database relationship. This nullable FK lets a report state
-- exactly which Site Visit obligation it fulfills without changing the
-- existing Project -> Stage -> Report model or the project-wide Visit Number.
-- ============================================================

alter table public.term_responses
  add column if not exists site_visit_request_id uuid;

DO $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'term_responses_site_visit_request_id_fkey'
      and conrelid = 'public.term_responses'::regclass
  ) then
    alter table public.term_responses
      add constraint term_responses_site_visit_request_id_fkey
      foreign key (site_visit_request_id)
      references public.site_visit_requests(id)
      on delete set null;
  end if;
end $$;

-- One scheduled Site Visit represents one report obligation. A partial
-- unique index prevents retries/history rows from satisfying the same
-- obligation more than once while leaving unrelated reports unaffected.
create unique index if not exists term_responses_site_visit_request_unique
  on public.term_responses(site_visit_request_id)
  where site_visit_request_id is not null;

create index if not exists term_responses_site_visit_project_idx
  on public.term_responses(project_id, site_visit_request_id)
  where site_visit_request_id is not null;

-- Extend the existing Stage-report scope validation so a linked Site Visit
-- must belong to the same Project as the report. The Site Visit does not
-- define Stage ordering; project_stage_id remains the Stage source of truth.
create or replace function public.validate_stage_report_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.project_stages stage
    where stage.id = new.project_stage_id
      and stage.project_id = new.project_id
  ) then
    raise exception 'Report stage does not belong to the selected project';
  end if;

  if new.project_stage_term_id is not null and not exists (
    select 1
    from public.project_stage_terms term
    where term.id = new.project_stage_term_id
      and term.project_stage_id = new.project_stage_id
  ) then
    raise exception 'Legacy report term does not belong to the selected stage';
  end if;

  if new.site_visit_request_id is not null and not exists (
    select 1
    from public.site_visit_requests visit
    where visit.id = new.site_visit_request_id
      and visit.project_id = new.project_id
      and visit.status in ('scheduled', 'completed')
  ) then
    raise exception 'Site Visit does not belong to the selected project or is not a reportable scheduled visit';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_stage_report_scope() from public;

drop trigger if exists term_responses_validate_stage_scope on public.term_responses;
create trigger term_responses_validate_stage_scope
  before insert or update of project_id, project_stage_id, project_stage_term_id, site_visit_request_id
  on public.term_responses
  for each row execute function public.validate_stage_report_scope();

comment on column public.term_responses.site_visit_request_id is
  'Optional explicit relationship to the scheduled Site Visit whose Stage-based report obligation this response fulfills.';

-- Deliberately no automatic historical backfill is performed here. Existing
-- rows do not contain a reliable canonical Site Visit identifier, so matching
-- old reports to visits by date/project/position would invent relationships.
