-- Automatically assign immutable Visit Numbers per project.
-- Existing report rows and Visit Numbers are preserved.

create index if not exists term_responses_project_visit_idx
  on public.term_responses(project_id, visit_number desc);

create or replace function public.assign_project_report_visit_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- Visit Numbers identify a report occurrence and cannot be edited later.
    new.visit_number := old.visit_number;
    return new;
  end if;

  -- Serialize allocations only within the same project. Different projects can
  -- continue creating reports concurrently and each project starts from 1.
  perform pg_advisory_xact_lock(hashtextextended(new.project_id::text, 0));

  select coalesce(max(response.visit_number), 0) + 1
    into new.visit_number
  from public.term_responses response
  where response.project_id = new.project_id;

  return new;
end;
$$;

revoke all on function public.assign_project_report_visit_number() from public;

-- New reports always receive the next project-scoped Visit Number regardless
-- of any client payload value.
drop trigger if exists term_responses_assign_project_visit_number on public.term_responses;
create trigger term_responses_assign_project_visit_number
  before insert on public.term_responses
  for each row execute function public.assign_project_report_visit_number();

-- Protect existing Visit Numbers from manual or accidental updates.
drop trigger if exists term_responses_preserve_visit_number on public.term_responses;
create trigger term_responses_preserve_visit_number
  before update of visit_number on public.term_responses
  for each row execute function public.assign_project_report_visit_number();

comment on function public.assign_project_report_visit_number() is
  'Assigns the next immutable Visit Number within one project using a project-scoped transactional lock.';
