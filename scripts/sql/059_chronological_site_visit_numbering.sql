-- ============================================================
-- Chronological Site Visit numbering
--
-- Site Visit dates/times are stored as local calendar date + time-without-time-zone.
-- The canonical project Visit Number must therefore follow scheduled_date,
-- scheduled_time, with created_at/id used only as deterministic tie-breakers when
-- two visits have the exact same scheduled datetime.
--
-- Exact Site Visit -> Stage Report relationships remain keyed by
-- term_responses.site_visit_request_id. When chronology changes, the linked
-- Report's visit_number is updated to the same canonical number; no relationship
-- is inferred from Project/date/time/Visit Number and no duplicate Report is made.
-- ============================================================

-- Allow the internal resequencing function to update an already-reserved Site
-- Visit number while preserving the existing immutability rule for all normal
-- application writes.
create or replace function public.assign_site_visit_report_visit_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_number integer;
begin
  if current_setting('buildsight.resequence_site_visit_numbers', true) = 'on' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.report_visit_number is not null then
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

-- Keep linked Report Visit Numbers immutable for ordinary writes, but permit the
-- canonical resequencer to move the metadata together with its exact Site Visit.
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
    if current_setting('buildsight.resequence_site_visit_numbers', true) = 'on' then
      return new;
    end if;
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

-- Resequencing changes only canonical Visit Number metadata. Preserve the Report
-- updated_at timestamp during that internal operation so historical/finalized
-- Reports do not look edited merely because their linked Site Visit chronology
-- was corrected. Normal updates keep the existing timestamp behavior.
create or replace function public.touch_project_stage_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'term_responses'
     and current_setting('buildsight.resequence_site_visit_numbers', true) = 'on' then
    new.updated_at := old.updated_at;
    return new;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.touch_site_visit_request_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('buildsight.resequence_site_visit_numbers', true) = 'on' then
    new.updated_at := old.updated_at;
    return new;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.resequence_project_site_visit_numbers(target_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_visit_count integer;
  fixed_number_count integer;
  temporary_base integer;
begin
  if target_project_id is null then
    return;
  end if;

  -- Serialize all Visit Number allocation/resequencing within one Project.
  perform pg_advisory_xact_lock(hashtextextended(target_project_id::text, 0));

  select count(*)::integer
    into active_visit_count
  from public.site_visit_requests visit
  where visit.project_id = target_project_id
    and visit.status in ('scheduled', 'completed');

  if active_visit_count = 0 then
    return;
  end if;

  select count(*)::integer
    into fixed_number_count
  from (
    select response.visit_number as number_value
    from public.term_responses response
    where response.project_id = target_project_id
      and response.site_visit_request_id is null
      and response.visit_number > 0
    union
    select visit.report_visit_number as number_value
    from public.site_visit_requests visit
    where visit.project_id = target_project_id
      and visit.status not in ('scheduled', 'completed')
      and visit.report_visit_number is not null
      and visit.report_visit_number > 0
  ) fixed_numbers;

  select coalesce(max(number_value), 0) + active_visit_count + fixed_number_count + 1000
    into temporary_base
  from (
    select response.visit_number as number_value
    from public.term_responses response
    where response.project_id = target_project_id
    union all
    select visit.report_visit_number as number_value
    from public.site_visit_requests visit
    where visit.project_id = target_project_id
      and visit.report_visit_number is not null
  ) all_numbers;

  perform set_config('buildsight.resequence_site_visit_numbers', 'on', true);

  -- Move active Site Visits out of the existing positive-number range first so
  -- swaps/reordering cannot violate the project-scoped unique index mid-update.
  with ordered_visits as (
    select
      visit.id,
      row_number() over (
        order by
          visit.scheduled_date asc nulls last,
          visit.scheduled_time asc nulls last,
          visit.created_at asc,
          visit.id asc
      )::integer as chronological_position
    from public.site_visit_requests visit
    where visit.project_id = target_project_id
      and visit.status in ('scheduled', 'completed')
  )
  update public.site_visit_requests visit
  set report_visit_number = temporary_base + ordered_visits.chronological_position
  from ordered_visits
  where visit.id = ordered_visits.id;

  -- Keep every existing linked Report attached to its exact siteVisitId while
  -- moving Visit Number metadata to the same temporary value.
  update public.term_responses response
  set visit_number = visit.report_visit_number
  from public.site_visit_requests visit
  where response.project_id = target_project_id
    and response.site_visit_request_id = visit.id
    and visit.project_id = target_project_id
    and visit.status in ('scheduled', 'completed');

  -- Unlinked Stage Reports and non-active historical Site Visit reservations are
  -- fixed. Active Site Visits take the smallest available positive numbers in
  -- real scheduled chronology, skipping only those fixed numbers.
  with fixed_numbers as (
    select response.visit_number as number_value
    from public.term_responses response
    where response.project_id = target_project_id
      and response.site_visit_request_id is null
      and response.visit_number > 0
    union
    select visit.report_visit_number as number_value
    from public.site_visit_requests visit
    where visit.project_id = target_project_id
      and visit.status not in ('scheduled', 'completed')
      and visit.report_visit_number is not null
      and visit.report_visit_number > 0
  ),
  available_numbers as (
    select
      candidate.number_value,
      row_number() over (order by candidate.number_value)::integer as available_position
    from generate_series(1, active_visit_count + fixed_number_count + 1) as candidate(number_value)
    where not exists (
      select 1
      from fixed_numbers fixed
      where fixed.number_value = candidate.number_value
    )
  ),
  ordered_visits as (
    select
      visit.id,
      row_number() over (
        order by
          visit.scheduled_date asc nulls last,
          visit.scheduled_time asc nulls last,
          visit.created_at asc,
          visit.id asc
      )::integer as chronological_position
    from public.site_visit_requests visit
    where visit.project_id = target_project_id
      and visit.status in ('scheduled', 'completed')
  ),
  canonical_numbers as (
    select ordered_visits.id, available_numbers.number_value as visit_number
    from ordered_visits
    join available_numbers
      on available_numbers.available_position = ordered_visits.chronological_position
  )
  update public.site_visit_requests visit
  set report_visit_number = canonical_numbers.visit_number
  from canonical_numbers
  where visit.id = canonical_numbers.id;

  -- Propagate the final canonical number through the exact FK relationship.
  update public.term_responses response
  set visit_number = visit.report_visit_number
  from public.site_visit_requests visit
  where response.project_id = target_project_id
    and response.site_visit_request_id = visit.id
    and visit.project_id = target_project_id
    and visit.status in ('scheduled', 'completed');

  perform set_config('buildsight.resequence_site_visit_numbers', 'off', true);
end;
$$;

revoke all on function public.resequence_project_site_visit_numbers(uuid) from public;
grant execute on function public.resequence_project_site_visit_numbers(uuid) to service_role;

create or replace function public.resequence_site_visit_numbers_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('scheduled', 'completed') then
      perform public.resequence_project_site_visit_numbers(new.project_id);
    end if;
    return new;
  end if;

  if old.project_id is distinct from new.project_id and old.status in ('scheduled', 'completed') then
    perform public.resequence_project_site_visit_numbers(old.project_id);
  end if;

  if new.status in ('scheduled', 'completed') or old.status in ('scheduled', 'completed') then
    perform public.resequence_project_site_visit_numbers(new.project_id);
  end if;

  return new;
end;
$$;

revoke all on function public.resequence_site_visit_numbers_after_change() from public;

drop trigger if exists site_visit_requests_resequence_chronological_numbers on public.site_visit_requests;
create trigger site_visit_requests_resequence_chronological_numbers
  after insert or update of status, project_id, scheduled_date, scheduled_time
  on public.site_visit_requests
  for each row execute function public.resequence_site_visit_numbers_after_change();

-- Reconcile existing active Site Visits immediately. This changes only canonical
-- Visit Number metadata and linked Report visit_number values; siteVisitId links,
-- Report rows, completion state, Stage ids, and scheduling fields remain intact.
DO $$
declare
  project_record record;
begin
  for project_record in
    select distinct visit.project_id
    from public.site_visit_requests visit
    where visit.status in ('scheduled', 'completed')
      and visit.project_id is not null
  loop
    perform public.resequence_project_site_visit_numbers(project_record.project_id);
  end loop;
end $$;

comment on function public.resequence_project_site_visit_numbers(uuid) is
  'Reassigns active Site Visit Report Visit Numbers by scheduled date/time and synchronizes exact linked Stage Reports by site_visit_request_id.';
