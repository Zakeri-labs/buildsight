-- ============================================================
-- Multiple independent reports per project Term / Sub-term
-- ============================================================

drop index if exists public.term_responses_term_unique;

create index if not exists term_responses_term_created_idx
  on public.term_responses(project_stage_term_id, created_at desc, id);
create index if not exists term_responses_term_status_updated_idx
  on public.term_responses(project_stage_term_id, status, updated_at desc);
create unique index if not exists term_responses_term_visit_unique
  on public.term_responses(project_stage_term_id, visit_number);

create or replace function public.aggregate_project_stage_term_report_status(target_term_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with ordered as (
    select response.status,
      row_number() over (
        order by coalesce(response.submitted_at, response.updated_at, response.created_at) desc,
                 response.created_at desc, response.id desc
      ) as position
    from public.term_responses response
    where response.project_stage_term_id = target_term_id
  )
  select case
    when count(*) = 0 then 'not_started'
    when coalesce(bool_or(status = 'under_review'), false) then 'under_review'
    when coalesce(bool_or(status = 'submitted'), false) then 'submitted'
    when coalesce(bool_or(position = 1 and status = 'rejected'), false) then 'rejected'
    when coalesce(bool_or(status in ('approved', 'completed')), false) then 'approved'
    when coalesce(bool_or(status = 'in_progress'), false) then 'in_progress'
    when coalesce(bool_or(status = 'draft'), false) then 'draft'
    else 'not_started'
  end
  from ordered;
$$;

revoke all on function public.aggregate_project_stage_term_report_status(uuid) from public;
grant execute on function public.aggregate_project_stage_term_report_status(uuid) to service_role;

create or replace function public.refresh_project_stage_rollups(target_term_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_parent_id uuid;
  target_stage_id uuid;
  rollup_term_id uuid;
begin
  select term.parent_term_id, term.project_stage_id
    into target_parent_id, target_stage_id
  from public.project_stage_terms term
  where term.id = target_term_id;

  if target_stage_id is null then return; end if;
  rollup_term_id := coalesce(target_parent_id, target_term_id);

  if rollup_term_id is not null then
    update public.project_stage_terms parent
    set status = case
      when not exists (
        select 1 from public.project_stage_terms child
        where child.parent_term_id = parent.id and child.is_active = true
      ) then public.aggregate_project_stage_term_report_status(parent.id)
      when exists (
        select 1 from public.project_stage_terms child
        where child.parent_term_id = parent.id and child.is_active = true and child.status = 'rejected'
          and (child.is_required = true or not exists (
            select 1 from public.project_stage_terms required_child
            where required_child.parent_term_id = parent.id and required_child.is_active = true and required_child.is_required = true
          ))
      ) then 'rejected'
      when exists (
        select 1 from public.project_stage_terms child
        where child.parent_term_id = parent.id and child.is_active = true and child.status in ('submitted','under_review')
          and (child.is_required = true or not exists (
            select 1 from public.project_stage_terms required_child
            where required_child.parent_term_id = parent.id and required_child.is_active = true and required_child.is_required = true
          ))
      ) then 'under_review'
      when not exists (
        select 1 from public.project_stage_terms child
        where child.parent_term_id = parent.id and child.is_active = true and child.status not in ('approved','completed')
          and (child.is_required = true or not exists (
            select 1 from public.project_stage_terms required_child
            where required_child.parent_term_id = parent.id and required_child.is_active = true and required_child.is_required = true
          ))
      ) then 'completed'
      when exists (
        select 1 from public.project_stage_terms child
        where child.parent_term_id = parent.id and child.is_active = true and child.status <> 'not_started'
          and (child.is_required = true or not exists (
            select 1 from public.project_stage_terms required_child
            where required_child.parent_term_id = parent.id and required_child.is_active = true and required_child.is_required = true
          ))
      ) then 'in_progress'
      else 'not_started'
    end,
    updated_at = now()
    where parent.id = rollup_term_id;
  end if;

  with actionable as (
    select term.id, term.is_required, term.status
    from public.project_stage_terms term
    where term.project_stage_id = target_stage_id
      and term.is_active = true
      and (
        (term.parent_term_id is not null and exists (
          select 1 from public.project_stage_terms parent
          where parent.id = term.parent_term_id and parent.project_stage_id = term.project_stage_id and parent.is_active = true
        ))
        or (term.parent_term_id is null and not exists (
          select 1 from public.project_stage_terms child
          where child.parent_term_id = term.id and child.is_active = true
        ))
      )
  ), counted as (
    select actionable.* from actionable
    where actionable.is_required = true
      or not exists (select 1 from actionable required_term where required_term.is_required = true)
  ), rollup as (
    select count(*) as total_count,
      count(*) filter (where status in ('approved','completed')) as completed_count,
      coalesce(bool_or(status <> 'not_started'), false) as has_started
    from counted
  )
  update public.project_stages stage
  set status = case
      when stage.status = 'disabled' then 'disabled'
      when rollup.total_count = 0 then 'not_started'
      when rollup.completed_count = rollup.total_count then 'completed'
      when rollup.has_started then 'in_progress'
      else 'not_started'
    end,
    started_at = case
      when stage.status = 'disabled' then stage.started_at
      when stage.started_at is null and rollup.has_started then now()
      else stage.started_at
    end,
    completed_at = case
      when stage.status = 'disabled' then stage.completed_at
      when rollup.total_count > 0 and rollup.completed_count = rollup.total_count then coalesce(stage.completed_at, now())
      else null
    end,
    updated_at = now()
  from rollup
  where stage.id = target_stage_id;
end;
$$;

revoke all on function public.refresh_project_stage_rollups(uuid) from public;
grant execute on function public.refresh_project_stage_rollups(uuid) to service_role;

create or replace function public.sync_project_stage_term_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_term_id uuid;
begin
  if tg_op = 'DELETE' then
    target_term_id := old.project_stage_term_id;
  else
    target_term_id := new.project_stage_term_id;
  end if;

  update public.project_stage_terms term
  set status = public.aggregate_project_stage_term_report_status(target_term_id), updated_at = now()
  where term.id = target_term_id;
  perform public.refresh_project_stage_rollups(target_term_id);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_project_stage_term_status() from public;

drop trigger if exists term_responses_sync_status on public.term_responses;
create trigger term_responses_sync_status
  after insert or delete or update of status on public.term_responses
  for each row execute function public.sync_project_stage_term_status();

do $$
declare term_record record;
begin
  for term_record in select id from public.project_stage_terms loop
    update public.project_stage_terms term
    set status = public.aggregate_project_stage_term_report_status(term.id), updated_at = term.updated_at
    where term.id = term_record.id
      and not exists (
        select 1 from public.project_stage_terms child
        where child.parent_term_id = term.id and child.is_active = true
      );
    perform public.refresh_project_stage_rollups(term_record.id);
  end loop;
end;
$$;
