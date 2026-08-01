-- ============================================================
-- Global Stage / Term / Sub-term library with project visibility
-- ============================================================

-- Extend the existing global stage_terms library instead of introducing a
-- second Sub-term definition table.
alter table public.stage_terms
  add column if not exists parent_term_id uuid,
  add column if not exists response_type text not null default 'combined',
  add column if not exists instructions text;

alter table public.stage_terms
  drop constraint if exists stage_terms_parent_term_fkey;
alter table public.stage_terms
  add constraint stage_terms_parent_term_fkey
  foreign key (parent_term_id)
  references public.stage_terms(id)
  on delete no action
  deferrable initially deferred;

alter table public.stage_terms
  drop constraint if exists stage_terms_not_self_parent;
alter table public.stage_terms
  add constraint stage_terms_not_self_parent
  check (parent_term_id is null or parent_term_id <> id);

alter table public.stage_terms
  drop constraint if exists stage_terms_response_type_check;
alter table public.stage_terms
  add constraint stage_terms_response_type_check check (
    response_type in (
      'combined',
      'text',
      'inspection_checklist',
      'yes_no',
      'pass_fail',
      'measurement',
      'date',
      'file_upload',
      'photo_evidence'
    )
  );

alter table public.stage_terms
  drop constraint if exists stage_terms_instructions_length_check;
alter table public.stage_terms
  add constraint stage_terms_instructions_length_check check (
    instructions is null or char_length(instructions) <= 5000
  );

-- The former index made a child name unique across an entire Stage. Parent and
-- child definitions now have independent, hierarchy-aware uniqueness.
drop index if exists public.stage_terms_stage_name_unique;
create unique index if not exists stage_terms_parent_name_unique
  on public.stage_terms(stage_id, lower(btrim(report_name)))
  where parent_term_id is null;
create unique index if not exists stage_subterms_parent_name_unique
  on public.stage_terms(parent_term_id, lower(btrim(report_name)))
  where parent_term_id is not null;
create index if not exists stage_terms_parent_order_idx
  on public.stage_terms(parent_term_id, sort_order, created_at)
  where parent_term_id is not null;

create or replace function public.validate_stage_term_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_row public.stage_terms%rowtype;
begin
  if tg_op = 'UPDATE' then
    if old.parent_term_id is distinct from new.parent_term_id then
      raise exception 'A global Term or Sub-term cannot be re-parented after creation';
    end if;
    if old.stage_id is distinct from new.stage_id then
      raise exception 'A global Term or Sub-term cannot be moved to another Stage';
    end if;
  end if;

  if new.parent_term_id is null then
    return new;
  end if;

  if new.id = new.parent_term_id then
    raise exception 'A Term cannot be its own parent';
  end if;

  select * into parent_row
  from public.stage_terms
  where id = new.parent_term_id;

  if parent_row.id is null then
    raise exception 'Parent Term not found';
  end if;
  if parent_row.parent_term_id is not null then
    raise exception 'Only one Sub-term level is allowed';
  end if;
  if parent_row.stage_id <> new.stage_id then
    raise exception 'A parent Term and its Sub-term must belong to the same Stage';
  end if;
  if exists (select 1 from public.stage_terms child where child.parent_term_id = new.id) then
    raise exception 'A Sub-term cannot contain another Sub-term';
  end if;

  return new;
end;
$$;

drop trigger if exists stage_terms_validate_hierarchy on public.stage_terms;
create trigger stage_terms_validate_hierarchy
  before insert or update of parent_term_id, stage_id
  on public.stage_terms
  for each row execute function public.validate_stage_term_hierarchy();

-- Promote existing project-only Sub-terms into reusable global definitions.
-- Existing project execution rows and every linked response/history record stay
-- in place; they are only linked to the new canonical template definition.
insert into public.stage_terms (
  stage_id,
  parent_term_id,
  report_name,
  is_required,
  responsible_organization_id,
  responsible_user_id,
  due_date_rule,
  approval_required,
  template_reference,
  response_type,
  instructions,
  status,
  sort_order,
  created_by,
  created_at,
  updated_at
)
select distinct on (parent_template.id, lower(btrim(child.report_name)))
  project_stage.template_stage_id,
  parent_template.id,
  child.report_name,
  child.is_required,
  child.responsible_organization_id,
  child.responsible_user_id,
  child.due_date_rule,
  child.approval_required,
  child.template_reference,
  coalesce(child.response_type, 'combined'),
  child.instructions,
  'active',
  child.sort_order,
  response.created_by,
  child.created_at,
  child.updated_at
from public.project_stage_terms child
join public.project_stage_terms project_parent on project_parent.id = child.parent_term_id
join public.stage_terms parent_template on parent_template.id = project_parent.template_term_id
join public.project_stages project_stage on project_stage.id = child.project_stage_id
left join public.term_responses response on response.project_stage_term_id = child.id
where child.parent_term_id is not null
  and child.template_term_id is null
  and project_stage.template_stage_id is not null
  and parent_template.parent_term_id is null
order by parent_template.id, lower(btrim(child.report_name)), child.created_at
on conflict do nothing;

update public.project_stage_terms child
set template_term_id = global_child.id
from public.project_stage_terms project_parent,
     public.stage_terms global_child
where child.parent_term_id = project_parent.id
  and child.template_term_id is null
  and project_parent.template_term_id = global_child.parent_term_id
  and lower(btrim(child.report_name)) = lower(btrim(global_child.report_name));

-- Keep definition edits centralized while preserving project execution status,
-- responses, responsibilities, dates, and project-specific active preferences.
create or replace function public.sync_stage_definition_to_projects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.project_stages
  set name = new.name,
      description = new.description,
      sort_order = new.sort_order,
      updated_at = now()
  where template_stage_id = new.id;
  return new;
end;
$$;

drop trigger if exists stages_sync_project_definitions on public.stages;
create trigger stages_sync_project_definitions
  after update of name, description, sort_order
  on public.stages
  for each row execute function public.sync_stage_definition_to_projects();

create or replace function public.sync_stage_term_definition_to_projects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.project_stage_terms
  set report_name = new.report_name,
      is_required = new.is_required,
      approval_required = new.approval_required,
      due_date_rule = new.due_date_rule,
      template_reference = new.template_reference,
      response_type = new.response_type,
      instructions = new.instructions,
      sort_order = new.sort_order,
      updated_at = now()
  where template_term_id = new.id;
  return new;
end;
$$;

drop trigger if exists stage_terms_sync_project_definitions on public.stage_terms;
create trigger stage_terms_sync_project_definitions
  after update of report_name, is_required, approval_required, due_date_rule,
    template_reference, response_type, instructions, sort_order
  on public.stage_terms
  for each row execute function public.sync_stage_term_definition_to_projects();

-- New projects receive every active global definition by default. Existing
-- projects are not touched when a new definition is created later; their admins
-- opt in through Manage Project Stages.
create or replace function public.instantiate_project_stages(target_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
begin
  select supervising_organization_id into target_org_id
  from public.projects where id = target_project_id;

  if target_org_id is null then return; end if;

  insert into public.project_stages (
    project_id, template_stage_id, name, description, status, sort_order
  )
  select target_project_id, stage.id, stage.name, stage.description, 'not_started', stage.sort_order
  from public.stages stage
  where stage.organization_id = target_org_id
    and stage.is_active = true
  on conflict do nothing;

  insert into public.project_stage_terms (
    project_stage_id, template_term_id, parent_term_id, report_name, is_required,
    responsible_organization_id, responsible_user_id, due_date_rule, due_date,
    approval_required, template_reference, response_type, instructions,
    status, sort_order, is_active
  )
  select project_stage.id, term.id, null, term.report_name, term.is_required,
    term.responsible_organization_id, term.responsible_user_id, term.due_date_rule,
    case term.due_date_rule
      when 'stage_start' then project.created_at::date
      when 'within_3_days' then (project.created_at + interval '3 days')::date
      when 'within_7_days' then (project.created_at + interval '7 days')::date
      when 'within_14_days' then (project.created_at + interval '14 days')::date
      else null
    end,
    term.approval_required, term.template_reference, term.response_type,
    term.instructions, 'not_started', term.sort_order, true
  from public.project_stages project_stage
  join public.projects project on project.id = project_stage.project_id
  join public.stage_terms term on term.stage_id = project_stage.template_stage_id
  where project_stage.project_id = target_project_id
    and term.parent_term_id is null
    and term.status = 'active'
  on conflict do nothing;

  insert into public.project_stage_terms (
    project_stage_id, template_term_id, parent_term_id, report_name, is_required,
    responsible_organization_id, responsible_user_id, due_date_rule, due_date,
    approval_required, template_reference, response_type, instructions,
    status, sort_order, is_active
  )
  select project_stage.id, child.id, project_parent.id, child.report_name, child.is_required,
    child.responsible_organization_id, child.responsible_user_id, child.due_date_rule,
    case child.due_date_rule
      when 'stage_start' then project.created_at::date
      when 'within_3_days' then (project.created_at + interval '3 days')::date
      when 'within_7_days' then (project.created_at + interval '7 days')::date
      when 'within_14_days' then (project.created_at + interval '14 days')::date
      else null
    end,
    child.approval_required, child.template_reference, child.response_type,
    child.instructions, 'not_started', child.sort_order, true
  from public.project_stages project_stage
  join public.projects project on project.id = project_stage.project_id
  join public.stage_terms child on child.stage_id = project_stage.template_stage_id
  join public.project_stage_terms project_parent
    on project_parent.project_stage_id = project_stage.id
   and project_parent.template_term_id = child.parent_term_id
  where project_stage.project_id = target_project_id
    and child.parent_term_id is not null
    and child.status = 'active'
  on conflict do nothing;
end;
$$;

-- Active progress ignores Sub-terms whose parent Term is disabled while preserving
-- the stored child preference for future re-enablement.
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

  if target_stage_id is null then
    return;
  end if;

  rollup_term_id := coalesce(target_parent_id, target_term_id);

  if rollup_term_id is not null then
    update public.project_stage_terms parent
    set status = case
      when not exists (
        select 1
        from public.project_stage_terms child
        where child.parent_term_id = parent.id
          and child.is_active = true
      ) then coalesce((
        select response.status
        from public.term_responses response
        where response.project_stage_term_id = parent.id
        limit 1
      ), 'not_started')
      when exists (
        select 1
        from public.project_stage_terms child
        where child.parent_term_id = parent.id
          and child.is_active = true
          and child.status = 'rejected'
          and (
            child.is_required = true
            or not exists (
              select 1
              from public.project_stage_terms required_child
              where required_child.parent_term_id = parent.id
                and required_child.is_active = true
                and required_child.is_required = true
            )
          )
      ) then 'rejected'
      when exists (
        select 1
        from public.project_stage_terms child
        where child.parent_term_id = parent.id
          and child.is_active = true
          and child.status in ('submitted','under_review')
          and (
            child.is_required = true
            or not exists (
              select 1
              from public.project_stage_terms required_child
              where required_child.parent_term_id = parent.id
                and required_child.is_active = true
                and required_child.is_required = true
            )
          )
      ) then 'under_review'
      when not exists (
        select 1
        from public.project_stage_terms child
        where child.parent_term_id = parent.id
          and child.is_active = true
          and child.status not in ('approved','completed')
          and (
            child.is_required = true
            or not exists (
              select 1
              from public.project_stage_terms required_child
              where required_child.parent_term_id = parent.id
                and required_child.is_active = true
                and required_child.is_required = true
            )
          )
      ) then 'completed'
      when exists (
        select 1
        from public.project_stage_terms child
        where child.parent_term_id = parent.id
          and child.is_active = true
          and child.status <> 'not_started'
          and (
            child.is_required = true
            or not exists (
              select 1
              from public.project_stage_terms required_child
              where required_child.parent_term_id = parent.id
                and required_child.is_active = true
                and required_child.is_required = true
            )
          )
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
        (
          term.parent_term_id is not null
          and exists (
            select 1
            from public.project_stage_terms parent
            where parent.id = term.parent_term_id
              and parent.project_stage_id = term.project_stage_id
              and parent.is_active = true
          )
        )
        or (
          term.parent_term_id is null
          and not exists (
            select 1
            from public.project_stage_terms child
            where child.parent_term_id = term.id
              and child.is_active = true
          )
        )
      )
  ), counted as (
    select actionable.*
    from actionable
    where actionable.is_required = true
      or not exists (select 1 from actionable required_term where required_term.is_required = true)
  ), rollup as (
    select
      count(*) as total_count,
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


-- Resolve hierarchy state through SECURITY DEFINER helpers so RLS policies do
-- not recursively query project_stage_terms (or recurse through term_responses).
create or replace function public.project_stage_term_hierarchy_active(target_term_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_stage_terms term
    join public.project_stages stage on stage.id = term.project_stage_id
    left join public.project_stage_terms parent on parent.id = term.parent_term_id
    where term.id = target_term_id
      and stage.status <> 'disabled'
      and term.is_active = true
      and (term.parent_term_id is null or parent.is_active = true)
  );
$$;

create or replace function public.project_stage_term_has_pending_review(target_term_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.term_responses response
    where response.project_stage_term_id = target_term_id
      and response.status in ('submitted', 'under_review')
  );
$$;

revoke all on function public.project_stage_term_hierarchy_active(uuid) from public;
revoke all on function public.project_stage_term_has_pending_review(uuid) from public;
grant execute on function public.project_stage_term_hierarchy_active(uuid) to authenticated, service_role;
grant execute on function public.project_stage_term_has_pending_review(uuid) to authenticated, service_role;

-- Reviewers retain read access to pending work after a project item is disabled.
-- Normal users still cannot discover or create new work against inactive items.
drop policy if exists project_stage_terms_select on public.project_stage_terms;
create policy project_stage_terms_select on public.project_stage_terms for select
  using (exists (
    select 1 from public.project_stages stage
    where stage.id = project_stage_terms.project_stage_id
      and public.can_access_project_stage(stage.project_id)
      and (
        public.project_stage_term_hierarchy_active(project_stage_terms.id)
        or public.is_project_admin(stage.project_id)
        or (
          public.is_project_stage_reviewer(stage.project_id)
          and public.project_stage_term_has_pending_review(project_stage_terms.id)
        )
      )
  ));

-- New employee work is allowed only when the full project hierarchy is active.
drop policy if exists term_responses_insert on public.term_responses;
create policy term_responses_insert on public.term_responses for insert
  with check (
    public.can_access_project_stage(project_id)
    and created_by = auth.uid()
    and exists (
      select 1
      from public.project_stage_terms term
      join public.project_stages stage on stage.id = term.project_stage_id
      where term.id = term_responses.project_stage_term_id
        and stage.project_id = term_responses.project_id
        and stage.status <> 'disabled'
        and term.is_active = true
        and (
          term.parent_term_id is null
          or exists (
            select 1 from public.project_stage_terms parent
            where parent.id = term.parent_term_id
              and parent.is_active = true
          )
        )
    )
  );

drop policy if exists term_responses_update on public.term_responses;
create policy term_responses_update on public.term_responses for update
  using (
    public.can_access_project_stage(project_id)
    and exists (
      select 1
      from public.project_stage_terms term
      join public.project_stages stage on stage.id = term.project_stage_id
      where term.id = term_responses.project_stage_term_id
        and stage.project_id = term_responses.project_id
        and (
          (
            stage.status <> 'disabled'
            and term.is_active = true
            and (
              term.parent_term_id is null
              or exists (
                select 1 from public.project_stage_terms parent
                where parent.id = term.parent_term_id
                  and parent.is_active = true
              )
            )
          )
          or public.is_project_admin(project_id)
          or public.is_project_stage_reviewer(project_id)
        )
    )
    and (
      created_by = auth.uid()
      or public.is_project_admin(project_id)
      or public.is_project_stage_reviewer(project_id)
      or exists (
        select 1 from public.project_stage_terms term
        where term.id = term_responses.project_stage_term_id
          and term.responsible_user_id = auth.uid()
      )
    )
  )
  with check (
    public.can_access_project_stage(project_id)
    and exists (
      select 1
      from public.project_stage_terms term
      join public.project_stages stage on stage.id = term.project_stage_id
      where term.id = term_responses.project_stage_term_id
        and stage.project_id = term_responses.project_id
        and (
          (
            stage.status <> 'disabled'
            and term.is_active = true
            and (
              term.parent_term_id is null
              or exists (
                select 1 from public.project_stage_terms parent
                where parent.id = term.parent_term_id
                  and parent.is_active = true
              )
            )
          )
          or public.is_project_admin(project_id)
          or public.is_project_stage_reviewer(project_id)
        )
    )
    and (
      created_by = auth.uid()
      or public.is_project_admin(project_id)
      or public.is_project_stage_reviewer(project_id)
      or exists (
        select 1 from public.project_stage_terms term
        where term.id = term_responses.project_stage_term_id
          and term.responsible_user_id = auth.uid()
      )
    )
  );

drop policy if exists term_responses_select on public.term_responses;
create policy term_responses_select on public.term_responses for select
  using (
    public.can_access_project_stage(project_id)
    and exists (
      select 1
      from public.project_stage_terms term
      join public.project_stages stage on stage.id = term.project_stage_id
      where term.id = term_responses.project_stage_term_id
        and stage.project_id = term_responses.project_id
        and (
          (
            stage.status <> 'disabled'
            and term.is_active = true
            and (
              term.parent_term_id is null
              or exists (
                select 1 from public.project_stage_terms parent
                where parent.id = term.parent_term_id
                  and parent.is_active = true
              )
            )
          )
          or public.is_project_admin(term_responses.project_id)
          or public.is_project_stage_reviewer(term_responses.project_id)
        )
    )
  );

drop policy if exists response_attachments_select on public.response_attachments;
create policy response_attachments_select on public.response_attachments for select
  using (
    public.can_access_project_stage(project_id)
    and exists (
      select 1
      from public.term_responses response
      join public.project_stage_terms term on term.id = response.project_stage_term_id
      join public.project_stages stage on stage.id = term.project_stage_id
      where response.id = response_attachments.response_id
        and response.project_id = response_attachments.project_id
        and (
          (
            stage.status <> 'disabled'
            and term.is_active = true
            and (
              term.parent_term_id is null
              or exists (
                select 1 from public.project_stage_terms parent
                where parent.id = term.parent_term_id
                  and parent.is_active = true
              )
            )
          )
          or public.is_project_admin(response_attachments.project_id)
          or public.is_project_stage_reviewer(response_attachments.project_id)
        )
    )
  );

drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals for select
  using (exists (
    select 1
    from public.term_responses response
    join public.project_stage_terms term on term.id = response.project_stage_term_id
    join public.project_stages stage on stage.id = term.project_stage_id
    where response.id = approvals.response_id
      and public.can_access_project_stage(response.project_id)
      and (
        (
            stage.status <> 'disabled'
            and term.is_active = true
            and (
              term.parent_term_id is null
              or exists (
                select 1 from public.project_stage_terms parent
                where parent.id = term.parent_term_id
                  and parent.is_active = true
              )
            )
          )
        or public.is_project_admin(response.project_id)
        or public.is_project_stage_reviewer(response.project_id)
      )
  ));

drop policy if exists approvals_insert on public.approvals;
create policy approvals_insert on public.approvals for insert
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1
      from public.term_responses response
      where response.id = approvals.response_id
        and response.status in ('submitted', 'under_review')
        and public.is_project_stage_reviewer(response.project_id)
    )
  );

revoke all on function public.validate_stage_term_hierarchy() from public;
revoke all on function public.sync_stage_definition_to_projects() from public;
revoke all on function public.sync_stage_term_definition_to_projects() from public;

-- Project workflow assignments are visibility records. They are deactivated,
-- never deleted through the authenticated client API.
drop policy if exists project_stage_terms_delete on public.project_stage_terms;

-- Evidence writes require the full Stage -> Term -> Sub-term hierarchy to be
-- active. Existing evidence stays readable to administrators and reviewers.
drop policy if exists response_attachments_insert on public.response_attachments;
create policy response_attachments_insert on public.response_attachments for insert
  with check (
    public.can_access_project_stage(project_id)
    and uploaded_by = auth.uid()
    and exists (
      select 1
      from public.term_responses response
      join public.project_stage_terms term on term.id = response.project_stage_term_id
      join public.project_stages stage on stage.id = term.project_stage_id
      where response.id = response_attachments.response_id
        and response.project_id = response_attachments.project_id
        and stage.status <> 'disabled'
        and term.is_active = true
        and (
          term.parent_term_id is null
          or exists (
            select 1 from public.project_stage_terms parent
            where parent.id = term.parent_term_id
              and parent.is_active = true
          )
        )
    )
  );

drop policy if exists response_attachments_delete on public.response_attachments;
create policy response_attachments_delete on public.response_attachments for delete
  using (
    (uploaded_by = auth.uid() or public.is_project_admin(project_id))
    and exists (
      select 1
      from public.term_responses response
      join public.project_stage_terms term on term.id = response.project_stage_term_id
      join public.project_stages stage on stage.id = term.project_stage_id
      where response.id = response_attachments.response_id
        and response.project_id = response_attachments.project_id
        and stage.status <> 'disabled'
        and term.is_active = true
        and (
          term.parent_term_id is null
          or exists (
            select 1 from public.project_stage_terms parent
            where parent.id = term.parent_term_id
              and parent.is_active = true
          )
        )
    )
  );

-- Translation records follow the same full-hierarchy visibility rules.
drop policy if exists translation_documents_select on public.translation_documents;
create policy translation_documents_select on public.translation_documents for select
  using (
    public.can_access_project_stage(project_id)
    and exists (
      select 1
      from public.project_stage_terms term
      join public.project_stages stage on stage.id = term.project_stage_id
      where term.id = translation_documents.project_stage_term_id
        and stage.project_id = translation_documents.project_id
        and (
          (
            stage.status <> 'disabled'
            and term.is_active = true
            and (
              term.parent_term_id is null
              or exists (
                select 1 from public.project_stage_terms parent
                where parent.id = term.parent_term_id
                  and parent.is_active = true
              )
            )
          )
          or public.is_project_admin(translation_documents.project_id)
          or public.is_project_stage_reviewer(translation_documents.project_id)
        )
    )
  );

drop policy if exists translation_documents_insert on public.translation_documents;
create policy translation_documents_insert on public.translation_documents for insert
  with check (
    created_by = auth.uid()
    and public.can_access_project_stage(project_id)
    and exists (
      select 1
      from public.project_stage_terms term
      join public.project_stages stage on stage.id = term.project_stage_id
      where term.id = translation_documents.project_stage_term_id
        and stage.project_id = translation_documents.project_id
        and stage.status <> 'disabled'
        and term.is_active = true
        and (
          term.parent_term_id is null
          or exists (
            select 1 from public.project_stage_terms parent
            where parent.id = term.parent_term_id
              and parent.is_active = true
          )
        )
    )
  );

drop policy if exists translation_documents_update on public.translation_documents;
create policy translation_documents_update on public.translation_documents for update
  using (
    public.can_access_project_stage(project_id)
    and exists (
      select 1
      from public.project_stage_terms term
      join public.project_stages stage on stage.id = term.project_stage_id
      where term.id = translation_documents.project_stage_term_id
        and stage.project_id = translation_documents.project_id
        and (
          (
            stage.status <> 'disabled'
            and term.is_active = true
            and (
              term.parent_term_id is null
              or exists (
                select 1 from public.project_stage_terms parent
                where parent.id = term.parent_term_id
                  and parent.is_active = true
              )
            )
          )
          or public.is_project_admin(project_id)
        )
    )
    and (
      created_by = auth.uid()
      or public.is_project_admin(project_id)
      or public.is_project_stage_reviewer(project_id)
    )
  )
  with check (
    public.can_access_project_stage(project_id)
    and exists (
      select 1
      from public.project_stage_terms term
      join public.project_stages stage on stage.id = term.project_stage_id
      where term.id = translation_documents.project_stage_term_id
        and stage.project_id = translation_documents.project_id
        and (
          (
            stage.status <> 'disabled'
            and term.is_active = true
            and (
              term.parent_term_id is null
              or exists (
                select 1 from public.project_stage_terms parent
                where parent.id = term.parent_term_id
                  and parent.is_active = true
              )
            )
          )
          or public.is_project_admin(project_id)
        )
    )
    and (
      created_by = auth.uid()
      or public.is_project_admin(project_id)
      or public.is_project_stage_reviewer(project_id)
    )
  );

drop policy if exists translation_documents_delete on public.translation_documents;
create policy translation_documents_delete on public.translation_documents for delete
  using (
    (created_by = auth.uid() or public.is_project_admin(project_id))
    and exists (
      select 1
      from public.project_stage_terms term
      join public.project_stages stage on stage.id = term.project_stage_id
      where term.id = translation_documents.project_stage_term_id
        and stage.project_id = translation_documents.project_id
        and stage.status <> 'disabled'
        and term.is_active = true
        and (
          term.parent_term_id is null
          or exists (
            select 1 from public.project_stage_terms parent
            where parent.id = term.parent_term_id
              and parent.is_active = true
          )
        )
    )
  );

-- Private Stage evidence remains recoverable by reviewers after deactivation,
-- while new uploads and deletions require an active hierarchy.
drop policy if exists stage_evidence_select on storage.objects;
create policy stage_evidence_select on storage.objects for select to authenticated
using (
  bucket_id = 'project-stage-evidence'
  and exists (
    select 1
    from public.term_responses response
    join public.project_stage_terms term on term.id = response.project_stage_term_id
    join public.project_stages stage on stage.id = term.project_stage_id
    where response.id = public.stage_evidence_response_id(name)
      and response.project_id = public.stage_evidence_project_id(name)
      and public.can_access_project_stage(response.project_id)
      and (
        (
          stage.status <> 'disabled'
          and term.is_active = true
          and (
            term.parent_term_id is null
            or exists (
              select 1 from public.project_stage_terms parent
              where parent.id = term.parent_term_id
                and parent.is_active = true
            )
          )
        )
        or public.is_project_admin(response.project_id)
        or public.is_project_stage_reviewer(response.project_id)
      )
  )
);

drop policy if exists stage_evidence_insert on storage.objects;
create policy stage_evidence_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'project-stage-evidence'
  and exists (
    select 1
    from public.term_responses response
    join public.project_stage_terms term on term.id = response.project_stage_term_id
    join public.project_stages stage on stage.id = term.project_stage_id
    where response.id = public.stage_evidence_response_id(name)
      and response.project_id = public.stage_evidence_project_id(name)
      and public.can_access_project_stage(response.project_id)
      and stage.status <> 'disabled'
      and term.is_active = true
      and (
        term.parent_term_id is null
        or exists (
          select 1 from public.project_stage_terms parent
          where parent.id = term.parent_term_id
            and parent.is_active = true
        )
      )
  )
);

drop policy if exists stage_evidence_delete on storage.objects;
create policy stage_evidence_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'project-stage-evidence'
  and (owner_id = auth.uid()::text or public.is_project_admin(public.stage_evidence_project_id(name)))
  and exists (
    select 1
    from public.term_responses response
    join public.project_stage_terms term on term.id = response.project_stage_term_id
    join public.project_stages stage on stage.id = term.project_stage_id
    where response.id = public.stage_evidence_response_id(name)
      and response.project_id = public.stage_evidence_project_id(name)
      and stage.status <> 'disabled'
      and term.is_active = true
      and (
        term.parent_term_id is null
        or exists (
          select 1 from public.project_stage_terms parent
          where parent.id = term.parent_term_id
            and parent.is_active = true
        )
      )
  )
);

-- Generated translation PDFs mirror the same private access model.
drop policy if exists stage_translation_pdfs_select on storage.objects;
create policy stage_translation_pdfs_select on storage.objects for select to authenticated
using (
  bucket_id = 'project-stage-translations'
  and exists (
    select 1
    from public.translation_documents translation
    join public.project_stage_terms term on term.id = translation.project_stage_term_id
    join public.project_stages stage on stage.id = term.project_stage_id
    where translation.id = public.stage_translation_path_uuid(name, 4)
      and translation.project_id = public.stage_translation_path_uuid(name, 1)
      and translation.project_stage_id = public.stage_translation_path_uuid(name, 2)
      and translation.project_stage_term_id = public.stage_translation_path_uuid(name, 3)
      and public.can_access_project_stage(translation.project_id)
      and (
        (
          stage.status <> 'disabled'
          and term.is_active = true
          and (
            term.parent_term_id is null
            or exists (
              select 1 from public.project_stage_terms parent
              where parent.id = term.parent_term_id
                and parent.is_active = true
            )
          )
        )
        or public.is_project_admin(translation.project_id)
        or public.is_project_stage_reviewer(translation.project_id)
      )
  )
);

drop policy if exists stage_translation_pdfs_insert on storage.objects;
create policy stage_translation_pdfs_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'project-stage-translations'
  and exists (
    select 1
    from public.translation_documents translation
    join public.project_stage_terms term on term.id = translation.project_stage_term_id
    join public.project_stages stage on stage.id = term.project_stage_id
    where translation.id = public.stage_translation_path_uuid(name, 4)
      and translation.project_id = public.stage_translation_path_uuid(name, 1)
      and translation.project_stage_id = public.stage_translation_path_uuid(name, 2)
      and translation.project_stage_term_id = public.stage_translation_path_uuid(name, 3)
      and public.can_access_project_stage(translation.project_id)
      and stage.status <> 'disabled'
      and term.is_active = true
      and (
        term.parent_term_id is null
        or exists (
          select 1 from public.project_stage_terms parent
          where parent.id = term.parent_term_id
            and parent.is_active = true
        )
      )
  )
);

drop policy if exists stage_translation_pdfs_update on storage.objects;
create policy stage_translation_pdfs_update on storage.objects for update to authenticated
using (
  bucket_id = 'project-stage-translations'
  and exists (
    select 1
    from public.translation_documents translation
    join public.project_stage_terms term on term.id = translation.project_stage_term_id
    join public.project_stages stage on stage.id = term.project_stage_id
    where translation.id = public.stage_translation_path_uuid(name, 4)
      and translation.project_id = public.stage_translation_path_uuid(name, 1)
      and translation.project_stage_id = public.stage_translation_path_uuid(name, 2)
      and translation.project_stage_term_id = public.stage_translation_path_uuid(name, 3)
      and public.can_access_project_stage(translation.project_id)
      and stage.status <> 'disabled'
      and term.is_active = true
      and (
        term.parent_term_id is null
        or exists (
          select 1 from public.project_stage_terms parent
          where parent.id = term.parent_term_id
            and parent.is_active = true
        )
      )
  )
)
with check (
  bucket_id = 'project-stage-translations'
  and exists (
    select 1
    from public.translation_documents translation
    join public.project_stage_terms term on term.id = translation.project_stage_term_id
    join public.project_stages stage on stage.id = term.project_stage_id
    where translation.id = public.stage_translation_path_uuid(name, 4)
      and translation.project_id = public.stage_translation_path_uuid(name, 1)
      and translation.project_stage_id = public.stage_translation_path_uuid(name, 2)
      and translation.project_stage_term_id = public.stage_translation_path_uuid(name, 3)
      and public.can_access_project_stage(translation.project_id)
      and stage.status <> 'disabled'
      and term.is_active = true
      and (
        term.parent_term_id is null
        or exists (
          select 1 from public.project_stage_terms parent
          where parent.id = term.parent_term_id
            and parent.is_active = true
        )
      )
  )
);

drop policy if exists stage_translation_pdfs_delete on storage.objects;
create policy stage_translation_pdfs_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'project-stage-translations'
  and exists (
    select 1
    from public.translation_documents translation
    join public.project_stage_terms term on term.id = translation.project_stage_term_id
    join public.project_stages stage on stage.id = term.project_stage_id
    where translation.id = public.stage_translation_path_uuid(name, 4)
      and translation.project_id = public.stage_translation_path_uuid(name, 1)
      and translation.project_stage_id = public.stage_translation_path_uuid(name, 2)
      and translation.project_stage_term_id = public.stage_translation_path_uuid(name, 3)
      and stage.status <> 'disabled'
      and term.is_active = true
      and (
        term.parent_term_id is null
        or exists (
          select 1 from public.project_stage_terms parent
          where parent.id = term.parent_term_id
            and parent.is_active = true
        )
      )
      and (owner_id = auth.uid()::text or public.is_project_admin(translation.project_id))
  )
);

revoke all on function public.instantiate_project_stages(uuid) from public;
revoke all on function public.refresh_project_stage_rollups(uuid) from public;

-- Global definition deletes are routed through the permission-checked server
-- actions. Direct authenticated deletes stay disabled so assigned definitions
-- can only be archived and historical project workflow data cannot cascade.
drop policy if exists stage_terms_delete on public.stage_terms;
drop policy if exists stages_delete on public.stages;
