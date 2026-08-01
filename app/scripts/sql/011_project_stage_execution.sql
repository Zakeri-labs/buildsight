-- ============================================================
-- Project stage execution and construction inspection responses
-- ============================================================

create table if not exists public.project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  template_stage_id uuid references public.stages(id) on delete set null,
  name text not null,
  description text,
  status text not null default 'not_started',
  sort_order integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_stages_status_check check (status in ('not_started','in_progress','completed','disabled')),
  constraint project_stages_name_not_blank check (length(btrim(name)) > 0)
);

create unique index if not exists project_stages_project_template_unique
  on public.project_stages(project_id, template_stage_id)
  where template_stage_id is not null;
create index if not exists project_stages_project_order_idx
  on public.project_stages(project_id, sort_order, created_at);

create table if not exists public.project_stage_terms (
  id uuid primary key default gen_random_uuid(),
  project_stage_id uuid not null references public.project_stages(id) on delete cascade,
  template_term_id uuid references public.stage_terms(id) on delete set null,
  report_name text not null,
  is_required boolean not null default true,
  responsible_organization_id uuid references public.organizations(id) on delete set null,
  responsible_user_id uuid references public.profiles(id) on delete set null,
  due_date_rule text not null default 'none',
  due_date date,
  approval_required boolean not null default false,
  template_reference text,
  status text not null default 'not_started',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_stage_terms_status_check check (
    status in ('not_started','draft','in_progress','submitted','under_review','approved','rejected','completed')
  ),
  constraint project_stage_terms_name_not_blank check (length(btrim(report_name)) > 0)
);

create unique index if not exists project_stage_terms_stage_template_unique
  on public.project_stage_terms(project_stage_id, template_term_id)
  where template_term_id is not null;
create index if not exists project_stage_terms_stage_order_idx
  on public.project_stage_terms(project_stage_id, sort_order, created_at);
create index if not exists project_stage_terms_responsible_user_idx
  on public.project_stage_terms(responsible_user_id) where responsible_user_id is not null;
create index if not exists project_stage_terms_due_date_idx
  on public.project_stage_terms(due_date) where due_date is not null;

create table if not exists public.term_responses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  project_stage_term_id uuid not null references public.project_stage_terms(id) on delete cascade,
  report_number text not null,
  visit_number integer not null default 1,
  report_type text not null default 'inspection_report',
  subject text,
  report_title text not null,
  response_content jsonb not null default '{"feedback":"","observation":"","findings":"","recommendations":"","correctiveActions":"","checklist":[]}'::jsonb,
  status text not null default 'draft',
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint term_responses_status_check check (
    status in ('draft','in_progress','submitted','under_review','approved','rejected','completed')
  ),
  constraint term_responses_visit_positive check (visit_number > 0),
  constraint term_responses_title_not_blank check (length(btrim(report_title)) > 0)
);

create unique index if not exists term_responses_term_unique
  on public.term_responses(project_stage_term_id);
create unique index if not exists term_responses_project_report_number_unique
  on public.term_responses(project_id, report_number);
create index if not exists term_responses_project_status_idx
  on public.term_responses(project_id, status, updated_at desc);

create table if not exists public.response_attachments (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.term_responses(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  attachment_kind text not null default 'evidence_image',
  width integer,
  height integer,
  sort_order integer not null default 0,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint response_attachments_kind_check check (attachment_kind in ('evidence_image','document','inline_image')),
  constraint response_attachments_size_check check (size_bytes >= 0),
  constraint response_attachments_path_not_blank check (length(btrim(storage_path)) > 0)
);

create unique index if not exists response_attachments_path_unique
  on public.response_attachments(storage_path);
create index if not exists response_attachments_response_order_idx
  on public.response_attachments(response_id, sort_order, created_at);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.term_responses(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  decision text not null,
  comments text,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint approvals_decision_check check (decision in ('approved','rejected'))
);

create index if not exists approvals_response_date_idx
  on public.approvals(response_id, decided_at desc);

create or replace function public.touch_project_stage_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_stages_touch_updated_at on public.project_stages;
create trigger project_stages_touch_updated_at before update on public.project_stages
for each row execute function public.touch_project_stage_updated_at();

drop trigger if exists project_stage_terms_touch_updated_at on public.project_stage_terms;
create trigger project_stage_terms_touch_updated_at before update on public.project_stage_terms
for each row execute function public.touch_project_stage_updated_at();

drop trigger if exists term_responses_touch_updated_at on public.term_responses;
create trigger term_responses_touch_updated_at before update on public.term_responses
for each row execute function public.touch_project_stage_updated_at();

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
  where stage.organization_id = target_org_id and stage.is_active = true
  on conflict do nothing;

  insert into public.project_stage_terms (
    project_stage_id, template_term_id, report_name, is_required,
    responsible_organization_id, responsible_user_id, due_date_rule, due_date,
    approval_required, template_reference, status, sort_order
  )
  select project_stage.id, term.id, term.report_name, term.is_required,
    term.responsible_organization_id, term.responsible_user_id, term.due_date_rule,
    case term.due_date_rule
      when 'stage_start' then project.created_at::date
      when 'within_3_days' then (project.created_at + interval '3 days')::date
      when 'within_7_days' then (project.created_at + interval '7 days')::date
      when 'within_14_days' then (project.created_at + interval '14 days')::date
      else null
    end,
    term.approval_required, term.template_reference, 'not_started', term.sort_order
  from public.project_stages project_stage
  join public.projects project on project.id = project_stage.project_id
  join public.stage_terms term on term.stage_id = project_stage.template_stage_id
  where project_stage.project_id = target_project_id and term.status = 'active'
  on conflict do nothing;
end;
$$;

create or replace function public.instantiate_project_stages_after_project_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.instantiate_project_stages(new.id);
  return new;
end;
$$;

drop trigger if exists projects_instantiate_stages on public.projects;
create trigger projects_instantiate_stages
  after insert on public.projects
  for each row execute function public.instantiate_project_stages_after_project_insert();

-- Backfill all existing projects without altering global templates.
do $$
declare project_record record;
begin
  for project_record in select id from public.projects loop
    perform public.instantiate_project_stages(project_record.id);
  end loop;
end;
$$;

-- Keep project term status synchronized with its single response.
create or replace function public.sync_project_stage_term_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.project_stage_terms
  set status = new.status, updated_at = now()
  where id = new.project_stage_term_id;

  update public.project_stages stage
  set status = case
    when not exists (
      select 1 from public.project_stage_terms term
      where term.project_stage_id = stage.id
        and term.is_required = true
        and term.status not in ('approved','completed')
    ) then 'completed'
    when exists (
      select 1 from public.project_stage_terms term
      where term.project_stage_id = stage.id
        and term.status <> 'not_started'
    ) then 'in_progress'
    else 'not_started'
  end,
  started_at = case
    when stage.started_at is null and new.status <> 'not_started' then now()
    else stage.started_at
  end,
  completed_at = case
    when not exists (
      select 1 from public.project_stage_terms term
      where term.project_stage_id = stage.id
        and term.is_required = true
        and term.status not in ('approved','completed')
    ) then coalesce(stage.completed_at, now())
    else null
  end,
  updated_at = now()
  from public.project_stage_terms changed_term
  where changed_term.id = new.project_stage_term_id
    and stage.id = changed_term.project_stage_id;

  return new;
end;
$$;

drop trigger if exists term_responses_sync_status on public.term_responses;
create trigger term_responses_sync_status
  after insert or update of status on public.term_responses
  for each row execute function public.sync_project_stage_term_status();

create or replace function public.can_access_project_stage(proj uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_project_member(proj)
  or exists (
    select 1
    from public.projects project
    join public.organization_memberships membership
      on membership.organization_id = project.supervising_organization_id
    where project.id = proj
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  );
$$;

create or replace function public.is_project_stage_reviewer(proj uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_user_memberships membership
    where membership.project_id = proj
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.access_role in ('project_admin','project_manager','reviewer','approver')
  )
  or exists (
    select 1
    from public.projects project
    join public.organization_memberships membership
      on membership.organization_id = project.supervising_organization_id
    where project.id = proj
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role in ('org_admin','org_manager')
  );
$$;

create or replace function public.validate_term_response_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if old.status in ('approved', 'completed') then
    raise exception 'Completed stage reports are locked';
  end if;

  if old.status in ('submitted', 'under_review') then
    if old.status is not distinct from new.status then
      raise exception 'Reports under review are locked';
    end if;
    if not public.is_project_stage_reviewer(new.project_id) then
      raise exception 'Only authorized reviewers can change a report under review';
    end if;
    if old.status = 'submitted' and new.status not in ('under_review', 'approved', 'rejected') then
      raise exception 'Invalid submitted report status transition';
    end if;
    if old.status = 'under_review' and new.status not in ('approved', 'rejected') then
      raise exception 'Invalid review status transition';
    end if;
  elsif old.status is distinct from new.status
        and new.status in ('approved', 'rejected', 'under_review')
        and not public.is_project_stage_reviewer(new.project_id) then
    raise exception 'Only authorized reviewers can review stage reports';
  end if;

  return new;
end;
$$;

drop trigger if exists term_responses_validate_status on public.term_responses;
create trigger term_responses_validate_status
  before update on public.term_responses
  for each row execute function public.validate_term_response_status_transition();

create or replace function public.decide_project_stage_response(
  target_response_id uuid,
  target_project_id uuid,
  target_reviewer_id uuid,
  target_decision text,
  target_comments text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
  decision_time timestamptz := now();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'This function is restricted to trusted server operations';
  end if;
  if target_decision not in ('approved', 'rejected') then
    raise exception 'Invalid review decision';
  end if;
  if target_decision = 'rejected' and length(btrim(coalesce(target_comments, ''))) = 0 then
    raise exception 'Review comments are required when rejecting a report';
  end if;

  select response.status
    into current_status
  from public.term_responses response
  where response.id = target_response_id
    and response.project_id = target_project_id
  for update;

  if current_status is null then
    raise exception 'Report response not found';
  end if;
  if current_status not in ('submitted', 'under_review') then
    raise exception 'Only submitted reports can be approved or rejected';
  end if;

  insert into public.approvals (response_id, reviewer_id, decision, comments, decided_at)
  values (
    target_response_id,
    target_reviewer_id,
    target_decision,
    nullif(btrim(coalesce(target_comments, '')), ''),
    decision_time
  );

  update public.term_responses
  set status = target_decision,
      updated_by = target_reviewer_id,
      completed_at = case when target_decision = 'approved' then decision_time else null end,
      updated_at = decision_time
  where id = target_response_id;
end;
$$;

revoke all on function public.decide_project_stage_response(uuid, uuid, uuid, text, text) from public;
grant execute on function public.decide_project_stage_response(uuid, uuid, uuid, text, text) to service_role;



alter table public.project_stages enable row level security;
alter table public.project_stage_terms enable row level security;
alter table public.term_responses enable row level security;
alter table public.response_attachments enable row level security;
alter table public.approvals enable row level security;

drop policy if exists project_stages_select on public.project_stages;
create policy project_stages_select on public.project_stages for select
  using (public.can_access_project_stage(project_id));

drop policy if exists project_stages_write on public.project_stages;
create policy project_stages_write on public.project_stages for all
  using (public.is_project_admin(project_id))
  with check (public.is_project_admin(project_id));

drop policy if exists project_stage_terms_select on public.project_stage_terms;
create policy project_stage_terms_select on public.project_stage_terms for select
  using (exists (
    select 1 from public.project_stages stage
    where stage.id = project_stage_terms.project_stage_id
      and public.can_access_project_stage(stage.project_id)
  ));

drop policy if exists project_stage_terms_write on public.project_stage_terms;
create policy project_stage_terms_write on public.project_stage_terms for all
  using (exists (
    select 1 from public.project_stages stage
    where stage.id = project_stage_terms.project_stage_id and public.is_project_admin(stage.project_id)
  ))
  with check (exists (
    select 1 from public.project_stages stage
    where stage.id = project_stage_terms.project_stage_id and public.is_project_admin(stage.project_id)
  ));

drop policy if exists term_responses_select on public.term_responses;
create policy term_responses_select on public.term_responses for select
  using (public.can_access_project_stage(project_id));

drop policy if exists term_responses_insert on public.term_responses;
create policy term_responses_insert on public.term_responses for insert
  with check (
    public.can_access_project_stage(project_id)
    and created_by = auth.uid()
  );

drop policy if exists term_responses_update on public.term_responses;
create policy term_responses_update on public.term_responses for update
  using (
    public.can_access_project_stage(project_id)
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

drop policy if exists response_attachments_select on public.response_attachments;
create policy response_attachments_select on public.response_attachments for select
  using (public.can_access_project_stage(project_id));

drop policy if exists response_attachments_insert on public.response_attachments;
create policy response_attachments_insert on public.response_attachments for insert
  with check (
    public.can_access_project_stage(project_id)
    and uploaded_by = auth.uid()
  );

drop policy if exists response_attachments_delete on public.response_attachments;
create policy response_attachments_delete on public.response_attachments for delete
  using (uploaded_by = auth.uid() or public.is_project_admin(project_id));

drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals for select
  using (exists (
    select 1 from public.term_responses response
    where response.id = approvals.response_id
      and public.can_access_project_stage(response.project_id)
  ));

drop policy if exists approvals_insert on public.approvals;
create policy approvals_insert on public.approvals for insert
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from public.term_responses response
      where response.id = approvals.response_id
        and public.is_project_stage_reviewer(response.project_id)
    )
  );

create or replace function public.stage_evidence_project_id(object_name text)
returns uuid
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  first_segment text;
begin
  first_segment := split_part(object_name, '/', 1);
  if first_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return first_segment::uuid;
  end if;
  return null;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-stage-evidence',
  'project-stage-evidence',
  false,
  52428800,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists stage_evidence_select on storage.objects;
create policy stage_evidence_select on storage.objects for select to authenticated
using (
  bucket_id = 'project-stage-evidence'
  and public.can_access_project_stage(public.stage_evidence_project_id(name))
);

drop policy if exists stage_evidence_insert on storage.objects;
create policy stage_evidence_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'project-stage-evidence'
  and public.can_access_project_stage(public.stage_evidence_project_id(name))
);

drop policy if exists stage_evidence_delete on storage.objects;
create policy stage_evidence_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'project-stage-evidence'
  and (owner_id = auth.uid()::text or public.is_project_admin(public.stage_evidence_project_id(name)))
);

revoke all on function public.instantiate_project_stages(uuid) from public;
revoke all on function public.instantiate_project_stages_after_project_insert() from public;
revoke all on function public.sync_project_stage_term_status() from public;
revoke all on function public.validate_term_response_status_transition() from public;

