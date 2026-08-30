-- Allow explicit updates to Visit Numbers on term_responses and site_visit_requests while preserving INSERT auto-numbering.

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
    if new.report_visit_number is null or new.report_visit_number <= 0 then
      new.report_visit_number := old.report_visit_number;
    end if;
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
    if new.visit_number is null or new.visit_number <= 0 then
      new.visit_number := old.visit_number;
    end if;
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
