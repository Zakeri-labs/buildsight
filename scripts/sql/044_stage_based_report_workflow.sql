-- ============================================================
-- Direct Project -> Stage -> Reports workflow
-- Keeps legacy Term/Sub-term tables as inactive historical data.
-- ============================================================

alter table public.term_responses
  add column if not exists project_stage_id uuid,
  add column if not exists responsible_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists approval_required boolean not null default true,
  add column if not exists response_type text not null default 'combined',
  add column if not exists template_reference text,
  add column if not exists instructions text;

update public.term_responses response
set project_stage_id = term.project_stage_id,
    responsible_user_id = coalesce(response.responsible_user_id, term.responsible_user_id),
    approval_required = coalesce(term.approval_required, response.approval_required, true),
    response_type = coalesce(nullif(term.response_type, ''), nullif(response.response_type, ''), 'combined'),
    template_reference = coalesce(term.template_reference, response.template_reference),
    instructions = coalesce(term.instructions, response.instructions)
from public.project_stage_terms term
where response.project_stage_term_id = term.id;

alter table public.term_responses alter column project_stage_id set not null;
alter table public.term_responses alter column project_stage_term_id drop not null;

alter table public.translation_documents alter column project_stage_term_id drop not null;

DO $$
begin
  if not exists (select 1 from pg_constraint where conname = 'term_responses_project_stage_id_fkey') then
    alter table public.term_responses
      add constraint term_responses_project_stage_id_fkey
      foreign key (project_stage_id) references public.project_stages(id) on delete cascade;
  end if;
end $$;

create index if not exists term_responses_stage_created_idx
  on public.term_responses(project_stage_id, created_at desc, id);
create index if not exists term_responses_stage_status_idx
  on public.term_responses(project_stage_id, status, updated_at desc);
create index if not exists term_responses_responsible_user_idx
  on public.term_responses(responsible_user_id) where responsible_user_id is not null;
create index if not exists translation_documents_project_stage_idx
  on public.translation_documents(project_id, project_stage_id, updated_at desc);

DO $$
begin
  if not exists (select 1 from pg_constraint where conname = 'term_responses_response_type_check') then
    alter table public.term_responses
      add constraint term_responses_response_type_check check (
        response_type in (
          'combined', 'text', 'inspection_checklist', 'yes_no', 'pass_fail',
          'measurement', 'date', 'file_upload', 'photo_evidence'
        )
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'term_responses_instructions_length_check') then
    alter table public.term_responses
      add constraint term_responses_instructions_length_check check (
        instructions is null or char_length(instructions) <= 5000
      );
  end if;
end $$;

create or replace function public.validate_stage_report_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.project_stages stage
    where stage.id = new.project_stage_id and stage.project_id = new.project_id
  ) then
    raise exception 'Report stage does not belong to the selected project';
  end if;

  if new.project_stage_term_id is not null and not exists (
    select 1 from public.project_stage_terms term
    where term.id = new.project_stage_term_id and term.project_stage_id = new.project_stage_id
  ) then
    raise exception 'Legacy report term does not belong to the selected stage';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_stage_report_scope() from public;
drop trigger if exists term_responses_validate_stage_scope on public.term_responses;
create trigger term_responses_validate_stage_scope
  before insert or update of project_id, project_stage_id, project_stage_term_id
  on public.term_responses
  for each row execute function public.validate_stage_report_scope();

create or replace function public.validate_stage_translation_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.term_responses response
    where response.id = new.response_id
      and response.project_id = new.project_id
      and response.project_stage_id = new.project_stage_id
  ) then
    raise exception 'Translation does not belong to the selected Project and Stage report';
  end if;

  if new.project_stage_term_id is not null and not exists (
    select 1
    from public.term_responses response
    where response.id = new.response_id
      and response.project_stage_term_id = new.project_stage_term_id
  ) then
    raise exception 'Legacy translation term does not match its report';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_stage_translation_scope() from public;
drop trigger if exists translation_documents_validate_stage_scope on public.translation_documents;
create trigger translation_documents_validate_stage_scope
  before insert or update of project_id, project_stage_id, project_stage_term_id, response_id
  on public.translation_documents
  for each row execute function public.validate_stage_translation_scope();

create or replace function public.can_write_project_stage_response(
  target_response_id uuid,
  target_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.can_access_project_stage(target_project_id)
    and exists (
      select 1
      from public.term_responses response
      join public.project_stages stage on stage.id = response.project_stage_id
      where response.id = target_response_id
        and response.project_id = target_project_id
        and stage.project_id = target_project_id
        and stage.status <> 'disabled'
        and response.status in ('draft', 'in_progress', 'rejected')
        and (
          response.created_by = auth.uid()
          or response.responsible_user_id = auth.uid()
          or public.is_project_admin(target_project_id)
        )
    );
$$;

revoke all on function public.can_write_project_stage_response(uuid, uuid) from public;
grant execute on function public.can_write_project_stage_response(uuid, uuid) to authenticated, service_role;

create or replace function public.can_manage_report_cc(target_response_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.can_access_project_stage(target_project_id)
    and exists (
      select 1
      from public.term_responses response
      join public.project_stages stage on stage.id = response.project_stage_id
      where response.id = target_response_id
        and response.project_id = target_project_id
        and stage.project_id = target_project_id
        and (
          response.created_by = auth.uid()
          or response.responsible_user_id = auth.uid()
          or public.is_project_admin(target_project_id)
        )
    );
$$;

revoke all on function public.can_manage_report_cc(uuid, uuid) from public;
grant execute on function public.can_manage_report_cc(uuid, uuid) to authenticated, service_role;

-- Direct report policies: Project + Stage only.
drop policy if exists term_responses_select on public.term_responses;
create policy term_responses_select on public.term_responses for select to authenticated
using (
  public.can_access_project_stage(project_id)
  and exists (
    select 1 from public.project_stages stage
    where stage.id = term_responses.project_stage_id
      and stage.project_id = term_responses.project_id
      and (
        stage.status <> 'disabled'
        or public.is_project_admin(term_responses.project_id)
        or public.is_project_stage_reviewer(term_responses.project_id)
      )
  )
);

drop policy if exists term_responses_insert on public.term_responses;
create policy term_responses_insert on public.term_responses for insert to authenticated
with check (
  created_by = auth.uid()
  and updated_by = auth.uid()
  and project_stage_term_id is null
  and public.can_access_project_stage(project_id)
  and exists (
    select 1 from public.project_stages stage
    where stage.id = term_responses.project_stage_id
      and stage.project_id = term_responses.project_id
      and stage.status <> 'disabled'
  )
);

drop policy if exists term_responses_update on public.term_responses;
create policy term_responses_update on public.term_responses for update to authenticated
using (
  public.can_access_project_stage(project_id)
  and exists (
    select 1 from public.project_stages stage
    where stage.id = term_responses.project_stage_id
      and stage.project_id = term_responses.project_id
      and (stage.status <> 'disabled' or public.is_project_admin(project_id) or public.is_project_stage_reviewer(project_id))
  )
  and (
    created_by = auth.uid()
    or responsible_user_id = auth.uid()
    or public.is_project_admin(project_id)
    or public.is_project_stage_reviewer(project_id)
  )
)
with check (
  public.can_access_project_stage(project_id)
  and exists (
    select 1 from public.project_stages stage
    where stage.id = term_responses.project_stage_id
      and stage.project_id = term_responses.project_id
      and (stage.status <> 'disabled' or public.is_project_admin(project_id) or public.is_project_stage_reviewer(project_id))
  )
  and (
    created_by = auth.uid()
    or responsible_user_id = auth.uid()
    or public.is_project_admin(project_id)
    or public.is_project_stage_reviewer(project_id)
  )
);

-- Evidence and attachments continue to use the existing buckets/components,
-- but authorization is now resolved from the report's direct Stage ID.
drop policy if exists response_attachments_select on public.response_attachments;
create policy response_attachments_select on public.response_attachments for select to authenticated
using (
  public.can_access_project_stage(project_id)
  and exists (
    select 1
    from public.term_responses response
    join public.project_stages stage on stage.id = response.project_stage_id
    where response.id = response_attachments.response_id
      and response.project_id = response_attachments.project_id
      and (
        stage.status <> 'disabled'
        or public.is_project_admin(response_attachments.project_id)
        or public.is_project_stage_reviewer(response_attachments.project_id)
      )
  )
);

drop policy if exists response_attachments_insert on public.response_attachments;
create policy response_attachments_insert on public.response_attachments for insert to authenticated
with check (uploaded_by = auth.uid() and public.can_write_project_stage_response(response_id, project_id));

drop policy if exists response_attachments_delete on public.response_attachments;
create policy response_attachments_delete on public.response_attachments for delete to authenticated
using (
  public.can_write_project_stage_response(response_id, project_id)
  and (uploaded_by = auth.uid() or public.is_project_admin(project_id))
);

drop policy if exists stage_evidence_select on storage.objects;
create policy stage_evidence_select on storage.objects for select to authenticated
using (
  bucket_id = 'project-stage-evidence'
  and exists (
    select 1
    from public.term_responses response
    join public.project_stages stage on stage.id = response.project_stage_id
    where response.id = public.stage_evidence_response_id(name)
      and response.project_id = public.stage_evidence_project_id(name)
      and public.can_access_project_stage(response.project_id)
      and (
        stage.status <> 'disabled'
        or public.is_project_admin(response.project_id)
        or public.is_project_stage_reviewer(response.project_id)
      )
  )
);

drop policy if exists stage_evidence_insert on storage.objects;
create policy stage_evidence_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'project-stage-evidence'
  and public.can_write_project_stage_response(
    public.stage_evidence_response_id(name),
    public.stage_evidence_project_id(name)
  )
);

drop policy if exists stage_evidence_delete on storage.objects;
create policy stage_evidence_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'project-stage-evidence'
  and (owner_id = auth.uid()::text or public.is_project_admin(public.stage_evidence_project_id(name)))
  and public.can_write_project_stage_response(
    public.stage_evidence_response_id(name),
    public.stage_evidence_project_id(name)
  )
);


-- Approval history is authorized through the report's direct Stage relationship.
drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals for select to authenticated
using (
  exists (
    select 1
    from public.term_responses response
    join public.project_stages stage on stage.id = response.project_stage_id
    where response.id = approvals.response_id
      and public.can_access_project_stage(response.project_id)
      and (
        stage.status <> 'disabled'
        or public.is_project_admin(response.project_id)
        or public.is_project_stage_reviewer(response.project_id)
      )
  )
);

-- Translation records remain unchanged structurally except that no Term ID is required.
drop policy if exists translation_documents_select on public.translation_documents;
create policy translation_documents_select on public.translation_documents for select to authenticated
using (
  public.can_access_project_stage(project_id)
  and exists (
    select 1
    from public.term_responses response
    join public.project_stages stage on stage.id = response.project_stage_id
    where response.id = translation_documents.response_id
      and response.project_id = translation_documents.project_id
      and response.project_stage_id = translation_documents.project_stage_id
      and (
        stage.status <> 'disabled'
        or public.is_project_admin(translation_documents.project_id)
        or public.is_project_stage_reviewer(translation_documents.project_id)
      )
  )
);

drop policy if exists translation_documents_insert on public.translation_documents;
create policy translation_documents_insert on public.translation_documents for insert to authenticated
with check (
  created_by = auth.uid()
  and project_stage_term_id is null
  and public.can_access_project_stage(project_id)
  and exists (
    select 1
    from public.term_responses response
    join public.project_stages stage on stage.id = response.project_stage_id
    where response.id = translation_documents.response_id
      and response.project_id = translation_documents.project_id
      and response.project_stage_id = translation_documents.project_stage_id
      and stage.status <> 'disabled'
  )
);

drop policy if exists translation_documents_update on public.translation_documents;
create policy translation_documents_update on public.translation_documents for update to authenticated
using (
  public.can_access_project_stage(project_id)
  and (created_by = auth.uid() or public.is_project_admin(project_id) or public.is_project_stage_reviewer(project_id))
  and exists (
    select 1
    from public.term_responses response
    join public.project_stages stage on stage.id = response.project_stage_id
    where response.id = translation_documents.response_id
      and response.project_id = translation_documents.project_id
      and response.project_stage_id = translation_documents.project_stage_id
      and (stage.status <> 'disabled' or public.is_project_admin(translation_documents.project_id))
  )
)
with check (
  public.can_access_project_stage(project_id)
  and (created_by = auth.uid() or public.is_project_admin(project_id) or public.is_project_stage_reviewer(project_id))
  and exists (
    select 1
    from public.term_responses response
    join public.project_stages stage on stage.id = response.project_stage_id
    where response.id = translation_documents.response_id
      and response.project_id = translation_documents.project_id
      and response.project_stage_id = translation_documents.project_stage_id
      and (stage.status <> 'disabled' or public.is_project_admin(translation_documents.project_id))
  )
);

drop policy if exists translation_documents_delete on public.translation_documents;
create policy translation_documents_delete on public.translation_documents for delete to authenticated
using (
  (created_by = auth.uid() or public.is_project_admin(project_id))
  and exists (
    select 1
    from public.term_responses response
    join public.project_stages stage on stage.id = response.project_stage_id
    where response.id = translation_documents.response_id
      and response.project_id = translation_documents.project_id
      and response.project_stage_id = translation_documents.project_stage_id
      and stage.status <> 'disabled'
  )
);

-- Generated translation PDFs use Project / Stage / Report / Translation paths.
drop policy if exists stage_translation_pdfs_select on storage.objects;
create policy stage_translation_pdfs_select on storage.objects for select to authenticated
using (
  bucket_id = 'project-stage-translations'
  and exists (
    select 1
    from public.translation_documents translation
    join public.term_responses response on response.id = translation.response_id
    join public.project_stages stage on stage.id = translation.project_stage_id
    where translation.id = public.stage_translation_path_uuid(name, 4)
      and translation.project_id = public.stage_translation_path_uuid(name, 1)
      and translation.project_stage_id = public.stage_translation_path_uuid(name, 2)
      and translation.response_id = public.stage_translation_path_uuid(name, 3)
      and response.project_id = translation.project_id
      and response.project_stage_id = translation.project_stage_id
      and stage.project_id = translation.project_id
      and public.can_access_project_stage(translation.project_id)
      and (
        stage.status <> 'disabled'
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
    join public.term_responses response on response.id = translation.response_id
    join public.project_stages stage on stage.id = translation.project_stage_id
    where translation.id = public.stage_translation_path_uuid(name, 4)
      and translation.project_id = public.stage_translation_path_uuid(name, 1)
      and translation.project_stage_id = public.stage_translation_path_uuid(name, 2)
      and translation.response_id = public.stage_translation_path_uuid(name, 3)
      and response.project_id = translation.project_id
      and response.project_stage_id = translation.project_stage_id
      and stage.project_id = translation.project_id
      and stage.status <> 'disabled'
      and public.can_access_project_stage(translation.project_id)
  )
);

drop policy if exists stage_translation_pdfs_update on storage.objects;
create policy stage_translation_pdfs_update on storage.objects for update to authenticated
using (
  bucket_id = 'project-stage-translations'
  and exists (
    select 1
    from public.translation_documents translation
    join public.term_responses response on response.id = translation.response_id
    join public.project_stages stage on stage.id = translation.project_stage_id
    where translation.id = public.stage_translation_path_uuid(name, 4)
      and translation.project_id = public.stage_translation_path_uuid(name, 1)
      and translation.project_stage_id = public.stage_translation_path_uuid(name, 2)
      and translation.response_id = public.stage_translation_path_uuid(name, 3)
      and response.project_id = translation.project_id
      and response.project_stage_id = translation.project_stage_id
      and stage.project_id = translation.project_id
      and stage.status <> 'disabled'
      and public.can_access_project_stage(translation.project_id)
  )
)
with check (
  bucket_id = 'project-stage-translations'
  and exists (
    select 1
    from public.translation_documents translation
    join public.term_responses response on response.id = translation.response_id
    join public.project_stages stage on stage.id = translation.project_stage_id
    where translation.id = public.stage_translation_path_uuid(name, 4)
      and translation.project_id = public.stage_translation_path_uuid(name, 1)
      and translation.project_stage_id = public.stage_translation_path_uuid(name, 2)
      and translation.response_id = public.stage_translation_path_uuid(name, 3)
      and response.project_id = translation.project_id
      and response.project_stage_id = translation.project_stage_id
      and stage.project_id = translation.project_id
      and stage.status <> 'disabled'
      and public.can_access_project_stage(translation.project_id)
  )
);

drop policy if exists stage_translation_pdfs_delete on storage.objects;
create policy stage_translation_pdfs_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'project-stage-translations'
  and exists (
    select 1
    from public.translation_documents translation
    join public.term_responses response on response.id = translation.response_id
    join public.project_stages stage on stage.id = translation.project_stage_id
    where translation.id = public.stage_translation_path_uuid(name, 4)
      and translation.project_id = public.stage_translation_path_uuid(name, 1)
      and translation.project_stage_id = public.stage_translation_path_uuid(name, 2)
      and translation.response_id = public.stage_translation_path_uuid(name, 3)
      and response.project_id = translation.project_id
      and response.project_stage_id = translation.project_stage_id
      and stage.project_id = translation.project_id
      and stage.status <> 'disabled'
      and (owner_id = auth.uid()::text or public.is_project_admin(translation.project_id))
  )
);

-- Stage status is rolled up directly from reports.
create or replace function public.refresh_project_stage_report_rollup(target_stage_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  report_count integer;
  completed_count integer;
begin
  select count(*), count(*) filter (where status in ('approved','completed'))
    into report_count, completed_count
  from public.term_responses
  where project_stage_id = target_stage_id;

  update public.project_stages stage
  set status = case
      when stage.status = 'disabled' then 'disabled'
      when report_count = 0 then 'not_started'
      when completed_count = report_count then 'completed'
      else 'in_progress'
    end,
    started_at = case
      when stage.status = 'disabled' then stage.started_at
      when report_count > 0 then coalesce(stage.started_at, now())
      else null
    end,
    completed_at = case
      when stage.status = 'disabled' then stage.completed_at
      when report_count > 0 and completed_count = report_count then coalesce(stage.completed_at, now())
      else null
    end,
    updated_at = now()
  where stage.id = target_stage_id;
end;
$$;

revoke all on function public.refresh_project_stage_report_rollup(uuid) from public;
grant execute on function public.refresh_project_stage_report_rollup(uuid) to service_role;

create or replace function public.sync_project_stage_report_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_project_stage_report_rollup(old.project_stage_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.project_stage_id is distinct from new.project_stage_id then
    perform public.refresh_project_stage_report_rollup(old.project_stage_id);
  end if;
  perform public.refresh_project_stage_report_rollup(new.project_stage_id);
  return new;
end;
$$;

revoke all on function public.sync_project_stage_report_status() from public;
drop trigger if exists term_responses_sync_status on public.term_responses;
create trigger term_responses_sync_status
  after insert or delete or update of status, project_stage_id on public.term_responses
  for each row execute function public.sync_project_stage_report_status();

DO $$
declare stage_record record;
begin
  for stage_record in select id from public.project_stages loop
    perform public.refresh_project_stage_report_rollup(stage_record.id);
  end loop;
end $$;

comment on column public.term_responses.project_stage_id is 'Direct Stage owner for the active Project -> Stage -> Reports workflow.';
comment on function public.can_write_project_stage_response(uuid, uuid) is 'Checks direct Stage report edit access without any Term/Sub-term dependency.';
