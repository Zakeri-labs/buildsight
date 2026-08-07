-- Canonical Viewer -> Project Owner authorization.
--
-- A Viewer may read only projects where that exact authenticated profile/user
-- is linked to a project_owners row. Owner contact text remains an editable
-- snapshot and is never used as an authorization identifier.

alter table public.project_owners
  add column if not exists viewer_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists viewer_invitation_id uuid references public.invitations(id) on delete set null;

create index if not exists project_owners_viewer_user_idx
  on public.project_owners (viewer_user_id, project_id)
  where viewer_user_id is not null;

create unique index if not exists project_owners_project_viewer_user_unique
  on public.project_owners (project_id, viewer_user_id)
  where viewer_user_id is not null;

create unique index if not exists project_owners_project_viewer_invitation_unique
  on public.project_owners (project_id, viewer_invitation_id)
  where viewer_invitation_id is not null;

comment on column public.project_owners.viewer_user_id is
  'Immutable authenticated Viewer/profile identity selected for this Owner slot. Project authorization uses this UUID, never editable Owner text/email.';
comment on column public.project_owners.viewer_invitation_id is
  'Pending Viewer invitation selected for this Owner slot. It grants no authenticated access until invitation acceptance links viewer_user_id.';

-- Safe immutable-ID backfill only. Never infer authorization from Owner email,
-- name, phone, or company text. Existing owner participants that are already
-- explicitly linked to a platform user provide a canonical identity source.
with immutable_owner_candidates as (
  select
    owner.id as owner_id,
    participant.key_contact_user_id as viewer_user_id,
    row_number() over (
      partition by owner.project_id, participant.key_contact_user_id
      order by owner.owner_order asc, owner.created_at asc, owner.id asc
    ) as owner_rank
  from public.project_owners owner
  join public.project_participants participant
    on participant.project_id = owner.project_id
   and participant.source_key = 'owner:' || owner.id::text
   and participant.status = 'active'
   and participant.key_contact_user_id is not null
  join public.projects project
    on project.id = owner.project_id
  join public.organization_memberships membership
    on membership.organization_id = project.supervising_organization_id
   and membership.user_id = participant.key_contact_user_id
   and membership.status = 'active'
   and membership.role = 'viewer'
  where owner.viewer_user_id is null
)
update public.project_owners owner
set viewer_user_id = candidate.viewer_user_id,
    updated_at = now()
from immutable_owner_candidates candidate
where candidate.owner_id = owner.id
  and candidate.owner_rank = 1;

-- --------------------------------------------------------------------------
-- Canonical Viewer owner helpers. SECURITY DEFINER avoids recursive RLS.
-- --------------------------------------------------------------------------
create or replace function public.user_has_viewer_role_on_project(
  target_user_id uuid,
  target_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id is not null
    and target_project_id is not null
    and exists (
      select 1
      from public.projects project
      join public.organization_memberships membership
        on membership.organization_id = project.supervising_organization_id
      where project.id = target_project_id
        and membership.user_id = target_user_id
        and membership.status = 'active'
        and membership.role = 'viewer'
    );
$$;

create or replace function public.user_is_project_owner_viewer(
  target_user_id uuid,
  target_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id is not null
    and target_project_id is not null
    and public.user_has_viewer_role_on_project(target_user_id, target_project_id)
    and exists (
      select 1
      from public.project_owners owner
      where owner.project_id = target_project_id
        and owner.viewer_user_id = target_user_id
    );
$$;

create or replace function public.is_project_owner_viewer(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_is_project_owner_viewer(auth.uid(), target_project_id);
$$;

create or replace function public.viewer_project_scope_allows_for_user(
  target_user_id uuid,
  target_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id is not null
    and target_project_id is not null
    and (
      not public.user_has_viewer_role_on_project(target_user_id, target_project_id)
      or public.user_is_project_owner_viewer(target_user_id, target_project_id)
    );
$$;

create or replace function public.viewer_project_scope_allows(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.viewer_project_scope_allows_for_user(auth.uid(), target_project_id);
$$;

revoke all on function public.user_has_viewer_role_on_project(uuid, uuid) from public, anon;
revoke all on function public.user_is_project_owner_viewer(uuid, uuid) from public, anon;
revoke all on function public.is_project_owner_viewer(uuid) from public, anon;
revoke all on function public.viewer_project_scope_allows_for_user(uuid, uuid) from public, anon;
revoke all on function public.viewer_project_scope_allows(uuid) from public, anon;
grant execute on function public.user_has_viewer_role_on_project(uuid, uuid) to service_role;
grant execute on function public.user_is_project_owner_viewer(uuid, uuid) to service_role;
grant execute on function public.viewer_project_scope_allows_for_user(uuid, uuid) to service_role;
grant execute on function public.is_project_owner_viewer(uuid) to authenticated, service_role;
grant execute on function public.viewer_project_scope_allows(uuid) to authenticated, service_role;

-- --------------------------------------------------------------------------
-- Validate and synchronize immutable Owner identity links.
-- --------------------------------------------------------------------------
create or replace function public.validate_project_owner_viewer_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervising_org_id uuid;
  v_invitation public.invitations%rowtype;
begin
  select project.supervising_organization_id
    into v_supervising_org_id
  from public.projects project
  where project.id = new.project_id;

  if v_supervising_org_id is null then
    raise exception 'Project not found for owner Viewer relationship';
  end if;

  if new.viewer_invitation_id is not null then
    select invitation.*
      into v_invitation
    from public.invitations invitation
    where invitation.id = new.viewer_invitation_id;

    if not found
       or v_invitation.organization_id <> v_supervising_org_id
       or v_invitation.organization_role <> 'viewer' then
      raise exception 'Selected Viewer invitation is not valid for this project';
    end if;

    if v_invitation.accepted_by is not null then
      if new.viewer_user_id is null then
        new.viewer_user_id := v_invitation.accepted_by;
      elsif new.viewer_user_id <> v_invitation.accepted_by then
        raise exception 'Viewer identity does not match the accepted invitation';
      end if;
    end if;
  end if;

  if new.viewer_user_id is not null and not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = v_supervising_org_id
      and membership.user_id = new.viewer_user_id
      and membership.status = 'active'
      and membership.role = 'viewer'
  ) then
    raise exception 'Selected Viewer is not an active Viewer in the supervising organization';
  end if;

  return new;
end;
$$;

create or replace function public.sync_project_owner_viewer_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.project_participants participant
  set key_contact_user_id = new.viewer_user_id,
      organization_name = new.name,
      key_contact_name = new.contact_name,
      key_contact_email = new.contact_email,
      key_contact_phone = new.contact_phone,
      updated_at = now()
  where participant.project_id = new.project_id
    and participant.source_key = 'owner:' || new.id::text;
  return new;
end;
$$;

drop trigger if exists project_owners_validate_viewer_identity on public.project_owners;
create trigger project_owners_validate_viewer_identity
  before insert or update of project_id, viewer_user_id, viewer_invitation_id
  on public.project_owners
  for each row execute function public.validate_project_owner_viewer_identity();

drop trigger if exists project_owners_sync_viewer_participant on public.project_owners;
create trigger project_owners_sync_viewer_participant
  after update of viewer_user_id, name, contact_name, contact_email, contact_phone
  on public.project_owners
  for each row execute function public.sync_project_owner_viewer_participant();

revoke all on function public.validate_project_owner_viewer_identity() from public, anon, authenticated;
revoke all on function public.sync_project_owner_viewer_participant() from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- Tighten shared project access helpers. Existing non-Viewer behavior is kept.
-- --------------------------------------------------------------------------
create or replace function public.is_project_member(proj uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.viewer_project_scope_allows(proj)
    and exists (
      select 1
      from public.project_user_memberships membership
      where membership.project_id = proj
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    );
$$;

create or replace function public.is_project_admin(proj uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.viewer_project_scope_allows(proj)
    and (
      exists (
        select 1
        from public.project_user_memberships membership
        where membership.project_id = proj
          and membership.user_id = auth.uid()
          and membership.status = 'active'
          and membership.access_role = 'project_admin'
      )
      or exists (
        select 1
        from public.projects project
        join public.organization_memberships membership
          on membership.organization_id = project.supervising_organization_id
        where project.id = proj
          and membership.user_id = auth.uid()
          and membership.status = 'active'
          and membership.role = 'org_admin'
      )
    );
$$;

create or replace function public.can_access_project_stage(proj uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.viewer_project_scope_allows(proj)
    and (
      public.is_project_member(proj)
      or exists (
        select 1
        from public.projects project
        join public.organization_memberships membership
          on membership.organization_id = project.supervising_organization_id
        where project.id = proj
          and membership.user_id = auth.uid()
          and membership.status = 'active'
      )
    );
$$;

create or replace function public.is_project_stage_reviewer(proj uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.viewer_project_scope_allows(proj)
    and (
      exists (
        select 1
        from public.project_user_memberships membership
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
      )
    );
$$;

-- Project-image Storage read access: owner Viewers can read only their linked
-- project; existing member/admin rules remain unchanged for other roles.
create or replace function public.can_view_project_image_storage(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and p_project_id is not null
    and public.viewer_project_scope_allows(p_project_id)
    and exists (
      select 1
      from public.projects project
      where project.id = p_project_id
        and (
          public.is_project_owner_viewer(project.id)
          or exists (
            select 1
            from public.project_user_memberships membership
            where membership.project_id = project.id
              and membership.user_id = auth.uid()
              and membership.status = 'active'
          )
          or exists (
            select 1
            from public.organization_memberships membership
            where membership.organization_id = project.supervising_organization_id
              and membership.user_id = auth.uid()
              and membership.status = 'active'
              and membership.role = 'org_admin'
          )
        )
    );
$$;

-- Site Visit helpers must not let a Viewer regain unrelated project access
-- through a stale participant or project-user membership.
create or replace function public.user_is_site_visit_client(target_user_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.user_has_viewer_role_on_project(target_user_id, target_project_id)
      then public.user_is_project_owner_viewer(target_user_id, target_project_id)
    else
      exists (
        select 1
        from public.project_participants participant
        where participant.project_id = target_project_id
          and participant.key_contact_user_id = target_user_id
          and participant.status = 'active'
          and (
            participant.project_role = 'client'
            or lower(coalesce(participant.participant_role_label, '')) in ('client', 'client / owner', 'owner', 'project owner')
          )
      )
      or exists (
        select 1
        from public.organization_memberships membership
        join public.project_organization_memberships project_org
          on project_org.organization_id = membership.organization_id
         and project_org.project_id = target_project_id
         and project_org.status = 'active'
         and project_org.project_role = 'client'
        where membership.user_id = target_user_id
          and membership.status = 'active'
      )
  end;
$$;

create or replace function public.user_can_manage_site_visits(target_user_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.viewer_project_scope_allows_for_user(target_user_id, target_project_id)
    and (
      exists (
        select 1
        from public.project_user_memberships membership
        where membership.project_id = target_project_id
          and membership.user_id = target_user_id
          and membership.status = 'active'
          and membership.access_role in ('project_admin', 'project_manager', 'inspector')
      )
      or exists (
        select 1
        from public.projects project
        join public.organization_memberships membership
          on membership.organization_id = project.supervising_organization_id
        where project.id = target_project_id
          and membership.user_id = target_user_id
          and membership.status = 'active'
          and membership.role in ('org_admin', 'org_manager')
      )
      or exists (
        select 1
        from public.project_organization_memberships project_org
        join public.organization_memberships membership
          on membership.organization_id = project_org.organization_id
        where project_org.project_id = target_project_id
          and project_org.project_role = 'consultant'
          and project_org.status = 'active'
          and membership.user_id = target_user_id
          and membership.status = 'active'
          and membership.role in ('org_admin', 'org_manager')
      )
      or exists (
        select 1
        from public.project_participants participant
        where participant.project_id = target_project_id
          and participant.key_contact_user_id = target_user_id
          and participant.status = 'active'
          and lower(coalesce(participant.participant_role_label, '')) in (
            'project manager', 'project supervisor', 'supervisor', 'site engineer'
          )
      )
    );
$$;

-- --------------------------------------------------------------------------
-- Read policies: owner Viewer can read own project, never unrelated projects.
-- Existing write policies continue to rely on the tightened member/admin helpers.
-- --------------------------------------------------------------------------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select
  using (
    public.is_project_owner_viewer(id)
    or public.is_project_member(id)
    or public.is_supervising_org_admin(id)
  );

drop policy if exists project_owners_select on public.project_owners;
create policy project_owners_select on public.project_owners for select
  using (
    public.is_project_owner_viewer(project_id)
    or public.is_project_member(project_id)
    or public.is_supervising_org_admin(project_id)
  );

drop policy if exists project_participants_select on public.project_participants;
create policy project_participants_select on public.project_participants for select
  using (
    public.is_project_owner_viewer(project_id)
    or public.is_project_member(project_id)
    or public.is_supervising_org_admin(project_id)
  );

drop policy if exists project_images_records_select on public.project_images;
create policy project_images_records_select on public.project_images for select
  using (
    public.is_project_owner_viewer(project_id)
    or public.is_project_member(project_id)
    or public.is_supervising_org_admin(project_id)
  );

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select
  using (
    public.is_project_owner_viewer(project_id)
    or public.is_project_member(project_id)
    or public.is_supervising_org_admin(project_id)
  );

drop policy if exists document_attachments_select on public.document_attachments;
create policy document_attachments_select on public.document_attachments for select
  using (
    public.is_project_owner_viewer(project_id)
    or public.is_project_member(project_id)
    or public.is_supervising_org_admin(project_id)
  );

drop policy if exists initial_docs_select on public.initial_docs;
create policy initial_docs_select on public.initial_docs for select
  using (
    public.is_project_owner_viewer(project_id)
    or public.is_project_member(project_id)
    or public.is_supervising_org_admin(project_id)
  );

drop policy if exists pom_select on public.project_organization_memberships;
create policy pom_select on public.project_organization_memberships for select
  using (
    public.is_project_owner_viewer(project_id)
    or public.is_project_member(project_id)
    or public.is_supervising_org_admin(project_id)
    or (
      public.viewer_project_scope_allows(project_id)
      and public.is_org_member(organization_id)
    )
  );

drop policy if exists pum_select on public.project_user_memberships;
create policy pum_select on public.project_user_memberships for select
  using (
    public.is_project_owner_viewer(project_id)
    or public.is_project_member(project_id)
    or public.is_supervising_org_admin(project_id)
    or (
      user_id = auth.uid()
      and public.viewer_project_scope_allows(project_id)
    )
  );

drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select
  using (
    actor_id = auth.uid()
    or (
      project_id is not null
      and (
        public.is_project_owner_viewer(project_id)
        or public.is_project_member(project_id)
        or public.is_supervising_org_admin(project_id)
      )
    )
    or (
      project_id is null
      and organization_id is not null
      and public.is_org_member(organization_id)
    )
  );

-- Site Visit read policies are explicitly project-scoped for Viewers.
drop policy if exists site_visit_requests_select on public.site_visit_requests;
create policy site_visit_requests_select on public.site_visit_requests for select
using (
  public.viewer_project_scope_allows(project_id)
  and (
    requested_by = auth.uid()
    or public.can_manage_site_visits(project_id)
  )
);

drop policy if exists site_visit_request_assignees_select on public.site_visit_request_assignees;
create policy site_visit_request_assignees_select on public.site_visit_request_assignees for select
using (
  exists (
    select 1
    from public.site_visit_requests request
    where request.id = site_visit_request_assignees.request_id
      and public.viewer_project_scope_allows(request.project_id)
      and (
        request.requested_by = auth.uid()
        or public.can_manage_site_visits(request.project_id)
      )
  )
);

-- --------------------------------------------------------------------------
-- Private Storage reads inherit the same project ownership isolation.
-- --------------------------------------------------------------------------
drop policy if exists document_images_select on storage.objects;
create policy document_images_select on storage.objects for select
  using (
    bucket_id = 'document-images'
    and array_length(storage.foldername(name), 1) >= 2
    and (
      public.is_project_owner_viewer(public.document_image_project_id(name))
      or public.is_project_member(public.document_image_project_id(name))
      or public.is_supervising_org_admin(public.document_image_project_id(name))
    )
  );

drop policy if exists initial_docs_storage_select on storage.objects;
create policy initial_docs_storage_select on storage.objects for select
  using (
    bucket_id = 'initial-docs'
    and array_length(storage.foldername(name), 1) >= 3
    and (
      public.is_project_owner_viewer(public.initial_doc_project_id(name))
      or public.is_project_member(public.initial_doc_project_id(name))
      or public.is_supervising_org_admin(public.initial_doc_project_id(name))
    )
  );

drop policy if exists participant_avatars_select on storage.objects;
create policy participant_avatars_select on storage.objects for select
using (
  bucket_id = 'participant-avatars'
  and public.participant_avatar_matches_record(name)
  and (
    public.is_project_owner_viewer(public.participant_avatar_project_id(name))
    or public.is_project_member(public.participant_avatar_project_id(name))
    or public.is_supervising_org_admin(public.participant_avatar_project_id(name))
  )
);

-- project-images keeps its existing policy; the policy delegates to the
-- redefined can_view_project_image_storage() above.

-- --------------------------------------------------------------------------
-- Invitation acceptance: pending Viewer Owner links grant no access until the
-- invited account is actually accepted. Acceptance atomically links the
-- canonical authenticated user id to every Owner slot that selected that invite.
-- --------------------------------------------------------------------------
create or replace function public.accept_invitation_atomic(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_invite public.invitations%rowtype;
  v_org_membership_id uuid;
  v_project_membership_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;

  if p_token is null or btrim(p_token) = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  select lower(btrim(u.email))
    into v_user_email
  from auth.users u
  where u.id = v_user_id;

  if v_user_email is null or v_user_email = '' then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;

  select invitation.*
    into v_invite
  from public.invitations invitation
  where invitation.token = p_token
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  if v_invite.status = 'accepted' then
    return jsonb_build_object('ok', false, 'code', 'accepted');
  elsif v_invite.status = 'revoked' then
    return jsonb_build_object('ok', false, 'code', 'revoked');
  elsif v_invite.status = 'expired' then
    return jsonb_build_object('ok', false, 'code', 'expired');
  elsif v_invite.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  if v_invite.expires_at <= now() then
    update public.invitations
    set status = 'expired', updated_at = now()
    where id = v_invite.id and status = 'pending';
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;

  if lower(btrim(v_invite.email)) <> v_user_email then
    return jsonb_build_object('ok', false, 'code', 'email_mismatch');
  end if;

  insert into public.profiles (id, email, full_name)
  select
    u.id,
    u.email,
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), '')
  from auth.users u
  where u.id = v_user_id
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        updated_at = now();

  if not exists (select 1 from public.profiles profile where profile.id = v_user_id) then
    return jsonb_build_object('ok', false, 'code', 'profile_unavailable');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_invite.organization_id::text || ':' || v_user_id::text, 0)
  );

  select membership.id
    into v_org_membership_id
  from public.organization_memberships membership
  where membership.organization_id = v_invite.organization_id
    and membership.user_id = v_user_id
  order by (membership.status = 'active') desc, membership.created_at asc
  limit 1
  for update;

  if v_org_membership_id is null then
    insert into public.organization_memberships (
      organization_id, user_id, role, status
    ) values (
      v_invite.organization_id, v_user_id, v_invite.organization_role, 'active'
    )
    returning id into v_org_membership_id;
  else
    update public.organization_memberships
    set role = v_invite.organization_role,
        status = 'active',
        updated_at = now()
    where id = v_org_membership_id;
  end if;

  update public.organizations
  set status = 'active', updated_at = now()
  where id = v_invite.organization_id
    and status in ('pending', 'invited');

  if v_invite.project_id is not null and v_invite.project_access_role is not null then
    select membership.id
      into v_project_membership_id
    from public.project_user_memberships membership
    where membership.project_id = v_invite.project_id
      and membership.user_id = v_user_id
      and membership.organization_id = v_invite.organization_id
    order by (membership.status = 'active') desc, membership.created_at asc
    limit 1
    for update;

    if v_project_membership_id is null then
      insert into public.project_user_memberships (
        project_id, user_id, organization_id, access_role, status, created_by
      ) values (
        v_invite.project_id,
        v_user_id,
        v_invite.organization_id,
        v_invite.project_access_role,
        'active',
        v_invite.invited_by
      )
      returning id into v_project_membership_id;
    else
      update public.project_user_memberships
      set access_role = v_invite.project_access_role,
          status = 'active',
          updated_at = now()
      where id = v_project_membership_id;
    end if;
  end if;

  -- This immutable link is the only new authorization-bearing Owner field.
  -- The invitation email itself is never consulted by project authorization.
  if v_invite.organization_role = 'viewer' then
    update public.project_owners owner
    set viewer_user_id = v_user_id,
        updated_at = now()
    where owner.viewer_invitation_id = v_invite.id;

    update public.project_participants participant
    set key_contact_user_id = v_user_id,
        updated_at = now()
    from public.project_owners owner
    where owner.viewer_invitation_id = v_invite.id
      and participant.project_id = owner.project_id
      and participant.source_key = 'owner:' || owner.id::text;
  end if;

  update public.invitations
  set status = 'accepted',
      accepted_by = v_user_id,
      updated_at = now()
  where id = v_invite.id
    and status = 'pending';

  if not found then
    raise exception 'Invitation state changed during acceptance';
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, organization_id, project_id, metadata
  ) values (
    v_user_id,
    'invitation.accepted',
    'invitation',
    v_invite.id,
    v_invite.organization_id,
    v_invite.project_id,
    jsonb_build_object('email', v_user_email, 'atomic', true)
  );

  return jsonb_build_object('ok', true, 'redirect', '/');
end;
$$;

revoke all on function public.accept_invitation_atomic(text) from public;
revoke all on function public.accept_invitation_atomic(text) from anon;
grant execute on function public.accept_invitation_atomic(text) to authenticated;
