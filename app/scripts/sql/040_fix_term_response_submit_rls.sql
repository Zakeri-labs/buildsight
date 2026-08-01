-- Repair authenticated Term/Sub-term report submission and evidence writes.
-- Keeps RLS enabled and scopes every write to an accessible, active project hierarchy.

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
      join public.project_stage_terms term
        on term.id = response.project_stage_term_id
      join public.project_stages stage
        on stage.id = term.project_stage_id
      where response.id = target_response_id
        and response.project_id = target_project_id
        and stage.project_id = target_project_id
        and response.status in ('draft', 'in_progress', 'rejected')
        and stage.status <> 'disabled'
        and term.is_active = true
        and (
          term.parent_term_id is null
          or exists (
            select 1
            from public.project_stage_terms parent
            where parent.id = term.parent_term_id
              and parent.project_stage_id = term.project_stage_id
              and parent.is_active = true
          )
        )
        and (
          response.created_by = auth.uid()
          or term.responsible_user_id = auth.uid()
          or public.is_project_admin(target_project_id)
        )
    );
$$;

revoke all on function public.can_write_project_stage_response(uuid, uuid) from public;
grant execute on function public.can_write_project_stage_response(uuid, uuid) to authenticated, service_role;

-- Inserts are made by the signed-in report author and must point to an active
-- Term/Sub-term in the same accessible project.
drop policy if exists term_responses_insert on public.term_responses;
create policy term_responses_insert
on public.term_responses
for insert
to authenticated
with check (
  created_by = auth.uid()
  and updated_by = auth.uid()
  and public.can_access_project_stage(project_id)
  and public.project_stage_term_hierarchy_active(project_stage_term_id)
  and exists (
    select 1
    from public.project_stage_terms term
    join public.project_stages stage on stage.id = term.project_stage_id
    where term.id = term_responses.project_stage_term_id
      and stage.project_id = term_responses.project_id
  )
);

-- Authors/responsible users can save and submit their own active reports.
-- Existing administrators/reviewers retain their current review access; the
-- status-transition trigger still enforces the review lifecycle.
drop policy if exists term_responses_update on public.term_responses;
create policy term_responses_update
on public.term_responses
for update
to authenticated
using (
  public.can_access_project_stage(project_id)
  and (
    public.project_stage_term_hierarchy_active(project_stage_term_id)
    or public.is_project_admin(project_id)
    or public.is_project_stage_reviewer(project_id)
  )
  and (
    created_by = auth.uid()
    or public.is_project_admin(project_id)
    or public.is_project_stage_reviewer(project_id)
    or exists (
      select 1
      from public.project_stage_terms term
      where term.id = term_responses.project_stage_term_id
        and term.responsible_user_id = auth.uid()
    )
  )
)
with check (
  public.can_access_project_stage(project_id)
  and (
    public.project_stage_term_hierarchy_active(project_stage_term_id)
    or public.is_project_admin(project_id)
    or public.is_project_stage_reviewer(project_id)
  )
  and (
    created_by = auth.uid()
    or public.is_project_admin(project_id)
    or public.is_project_stage_reviewer(project_id)
    or exists (
      select 1
      from public.project_stage_terms term
      where term.id = term_responses.project_stage_term_id
        and term.responsible_user_id = auth.uid()
    )
  )
);

-- Attachment metadata is written by the authenticated uploader only after the
-- report row exists and the caller is allowed to edit that exact report.
drop policy if exists response_attachments_insert on public.response_attachments;
create policy response_attachments_insert
on public.response_attachments
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and public.can_write_project_stage_response(response_id, project_id)
);

-- Storage object creation follows the same exact response/project check. This
-- closes the gap between the file upload and its response_attachments record.
drop policy if exists stage_evidence_insert on storage.objects;
create policy stage_evidence_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-stage-evidence'
  and public.can_write_project_stage_response(
    public.stage_evidence_response_id(name),
    public.stage_evidence_project_id(name)
  )
);

comment on function public.can_write_project_stage_response(uuid, uuid) is
  'Returns true when the signed-in user may add or change evidence for one exact active Term/Sub-term report.';
