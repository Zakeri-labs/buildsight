-- ============================================================
-- Project-specific stage activation and one-level sub-terms
-- ============================================================

alter table public.project_stage_terms
  add column if not exists parent_term_id uuid,
  add column if not exists is_active boolean not null default true;

alter table public.project_stage_terms
  drop constraint if exists project_stage_terms_parent_term_fkey;

alter table public.project_stage_terms
  add constraint project_stage_terms_parent_term_fkey
  foreign key (parent_term_id)
  references public.project_stage_terms(id)
  on delete no action
  deferrable initially deferred;

alter table public.project_stage_terms
  drop constraint if exists project_stage_terms_not_self_parent;

alter table public.project_stage_terms
  add constraint project_stage_terms_not_self_parent
  check (parent_term_id is null or parent_term_id <> id);

create index if not exists project_stage_terms_parent_order_idx
  on public.project_stage_terms(parent_term_id, sort_order, created_at)
  where parent_term_id is not null;

create unique index if not exists project_stage_subterms_active_name_unique
  on public.project_stage_terms(parent_term_id, lower(btrim(report_name)))
  where parent_term_id is not null and is_active = true;

create or replace function public.validate_project_stage_term_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_row public.project_stage_terms%rowtype;
begin
  if new.parent_term_id is null then
    if tg_op = 'UPDATE' then
      if old.project_stage_id is distinct from new.project_stage_id
        and exists (
          select 1
          from public.project_stage_terms child
          where child.parent_term_id = new.id
            and child.project_stage_id <> new.project_stage_id
        ) then
        raise exception 'A parent term and its sub-terms must remain in the same project stage';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if exists (
      select 1
      from public.project_stage_terms child
      where child.parent_term_id = new.id
    ) and old.parent_term_id is distinct from new.parent_term_id then
      raise exception 'A parent term with sub-terms cannot become a sub-term';
    end if;
  end if;

  if new.id = new.parent_term_id then
    raise exception 'A term cannot be its own parent';
  end if;

  select * into parent_row
  from public.project_stage_terms
  where id = new.parent_term_id;

  if parent_row.id is null then
    raise exception 'Parent term not found';
  end if;

  if parent_row.parent_term_id is not null then
    raise exception 'Only one sub-term level is allowed';
  end if;

  if parent_row.project_stage_id <> new.project_stage_id then
    raise exception 'Parent term and sub-term must belong to the same project stage';
  end if;

  if exists (
    select 1
    from public.project_stage_terms child
    where child.parent_term_id = new.id
  ) then
    raise exception 'A sub-term cannot contain another sub-term';
  end if;

  return new;
end;
$$;

drop trigger if exists project_stage_terms_validate_hierarchy on public.project_stage_terms;
create trigger project_stage_terms_validate_hierarchy
  before insert or update of parent_term_id, project_stage_id
  on public.project_stage_terms
  for each row execute function public.validate_project_stage_term_hierarchy();

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
        term.parent_term_id is not null
        or not exists (
          select 1
          from public.project_stage_terms child
          where child.parent_term_id = term.id
            and child.is_active = true
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

create or replace function public.refresh_project_stage_rollups_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Avoid recursive rollup updates when this trigger updates a parent term.
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.parent_term_id is not null then
      perform public.refresh_project_stage_rollups(old.parent_term_id);
    else
      update public.project_stages
      set updated_at = now()
      where id = old.project_stage_id;
    end if;
    return old;
  end if;

  perform public.refresh_project_stage_rollups(new.id);
  if tg_op = 'UPDATE' then
    if old.parent_term_id is distinct from new.parent_term_id and old.parent_term_id is not null then
      perform public.refresh_project_stage_rollups(old.parent_term_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists project_stage_terms_refresh_rollups on public.project_stage_terms;
create trigger project_stage_terms_refresh_rollups
  after insert or update or delete
  on public.project_stage_terms
  for each row execute function public.refresh_project_stage_rollups_trigger();

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

  perform public.refresh_project_stage_rollups(new.project_stage_term_id);
  return new;
end;
$$;

-- Keep inactive stages and archived sub-terms hidden from normal project users,
-- while retaining administrator access for safe management and recovery.
drop policy if exists project_stages_select on public.project_stages;
create policy project_stages_select on public.project_stages for select
  using (
    public.can_access_project_stage(project_id)
    and (status <> 'disabled' or public.is_project_admin(project_id))
  );

-- Project stages are activated/deactivated, never destructively removed through the client API.
drop policy if exists project_stages_write on public.project_stages;
drop policy if exists project_stages_insert on public.project_stages;
create policy project_stages_insert on public.project_stages for insert
  with check (public.is_project_admin(project_id));
drop policy if exists project_stages_update on public.project_stages;
create policy project_stages_update on public.project_stages for update
  using (public.is_project_admin(project_id))
  with check (public.is_project_admin(project_id));

drop policy if exists project_stage_terms_select on public.project_stage_terms;
create policy project_stage_terms_select on public.project_stage_terms for select
  using (exists (
    select 1 from public.project_stages stage
    where stage.id = project_stage_terms.project_stage_id
      and public.can_access_project_stage(stage.project_id)
      and (
        (stage.status <> 'disabled' and project_stage_terms.is_active = true)
        or public.is_project_admin(stage.project_id)
      )
  ));

drop policy if exists project_stage_terms_write on public.project_stage_terms;
drop policy if exists project_stage_terms_insert on public.project_stage_terms;
create policy project_stage_terms_insert on public.project_stage_terms for insert
  with check (exists (
    select 1 from public.project_stages stage
    where stage.id = project_stage_terms.project_stage_id
      and public.is_project_admin(stage.project_id)
  ));
drop policy if exists project_stage_terms_update on public.project_stage_terms;
create policy project_stage_terms_update on public.project_stage_terms for update
  using (exists (
    select 1 from public.project_stages stage
    where stage.id = project_stage_terms.project_stage_id
      and public.is_project_admin(stage.project_id)
  ))
  with check (exists (
    select 1 from public.project_stages stage
    where stage.id = project_stage_terms.project_stage_id
      and public.is_project_admin(stage.project_id)
  ));
drop policy if exists project_stage_terms_delete on public.project_stage_terms;
create policy project_stage_terms_delete on public.project_stage_terms for delete
  using (
    parent_term_id is not null
    and not exists (
      select 1 from public.term_responses response
      where response.project_stage_term_id = project_stage_terms.id
    )
    and exists (
      select 1 from public.project_stages stage
      where stage.id = project_stage_terms.project_stage_id
        and public.is_project_admin(stage.project_id)
    )
  );

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
        and stage.status <> 'disabled'
        and term.is_active = true
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
        and stage.status <> 'disabled'
        and term.is_active = true
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

revoke all on function public.validate_project_stage_term_hierarchy() from public;
revoke all on function public.refresh_project_stage_rollups(uuid) from public;
revoke all on function public.refresh_project_stage_rollups_trigger() from public;

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
          (stage.status <> 'disabled' and term.is_active = true)
          or public.is_project_admin(term_responses.project_id)
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
          (stage.status <> 'disabled' and term.is_active = true)
          or public.is_project_admin(response_attachments.project_id)
        )
    )
  );

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
        (stage.status <> 'disabled' and term.is_active = true)
        or public.is_project_admin(response.project_id)
      )
  ));

drop policy if exists approvals_insert on public.approvals;
create policy approvals_insert on public.approvals for insert
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1
      from public.term_responses response
      join public.project_stage_terms term on term.id = response.project_stage_term_id
      join public.project_stages stage on stage.id = term.project_stage_id
      where response.id = approvals.response_id
        and public.is_project_stage_reviewer(response.project_id)
        and stage.status <> 'disabled'
        and term.is_active = true
    )
  );

-- Translation records follow the same active-stage visibility and write rules.
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
          (stage.status <> 'disabled' and term.is_active = true)
          or public.is_project_admin(translation_documents.project_id)
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
        and stage.status <> 'disabled'
        and term.is_active = true
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
        and stage.status <> 'disabled'
        and term.is_active = true
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
    )
  );

create or replace function public.stage_translation_path_uuid(object_name text, segment_index integer)
returns uuid
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  path_segment text;
begin
  if segment_index < 1 or segment_index > 4 then
    return null;
  end if;
  path_segment := split_part(object_name, '/', segment_index);
  if path_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return path_segment::uuid;
  end if;
  return null;
end;
$$;

-- Generated translation PDFs use project/stage/term/translation identifiers in
-- their canonical object path. Normal members only access active workflow data;
-- project administrators retain read-only recovery access to inactive records.
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
        (stage.status <> 'disabled' and term.is_active = true)
        or public.is_project_admin(translation.project_id)
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
      and (owner_id = auth.uid()::text or public.is_project_admin(translation.project_id))
  )
);

revoke all on function public.stage_translation_path_uuid(text, integer) from public;
grant execute on function public.stage_translation_path_uuid(text, integer) to authenticated, service_role;

create or replace function public.stage_evidence_response_id(object_name text)
returns uuid
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  response_segment text;
begin
  response_segment := split_part(object_name, '/', 2);
  if response_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return response_segment::uuid;
  end if;
  return null;
end;
$$;

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
        (stage.status <> 'disabled' and term.is_active = true)
        or public.is_project_admin(response.project_id)
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
  )
);

