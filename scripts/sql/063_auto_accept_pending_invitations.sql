-- Auto-accept pending invitations for authenticated users.
-- Executed when a user signs up, logs in, or accesses the application with a matching email.

create or replace function public.accept_pending_invitations_for_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_email text;
  v_invite public.invitations%rowtype;
  v_accepted_count integer := 0;
  v_org_membership_id uuid;
  v_project_membership_id uuid;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'count', 0, 'error', 'user_id_null');
  end if;

  select lower(btrim(u.email))
    into v_user_email
  from auth.users u
  where u.id = p_user_id;

  if v_user_email is null or v_user_email = '' then
    return jsonb_build_object('ok', false, 'count', 0, 'error', 'user_email_not_found');
  end if;

  -- Ensure profile row exists before membership foreign keys are written.
  insert into public.profiles (id, email, full_name)
  select
    u.id,
    u.email,
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), '')
  from auth.users u
  where u.id = p_user_id
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        updated_at = now();

  -- Process all pending, non-expired invitations for this user's email
  for v_invite in
    select invitation.*
    from public.invitations invitation
    where lower(btrim(invitation.email)) = v_user_email
      and invitation.status = 'pending'
      and invitation.expires_at > now()
    order by invitation.created_at asc
    for update
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(v_invite.organization_id::text || ':' || p_user_id::text, 0)
    );

    -- Organization membership
    select membership.id
      into v_org_membership_id
    from public.organization_memberships membership
    where membership.organization_id = v_invite.organization_id
      and membership.user_id = p_user_id
    order by (membership.status = 'active') desc, membership.created_at asc
    limit 1
    for update;

    if v_org_membership_id is null then
      insert into public.organization_memberships (
        organization_id, user_id, role, status
      ) values (
        v_invite.organization_id, p_user_id, v_invite.organization_role, 'active'
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

    -- Project membership
    if v_invite.project_id is not null and v_invite.project_access_role is not null then
      select membership.id
        into v_project_membership_id
      from public.project_user_memberships membership
      where membership.project_id = v_invite.project_id
        and membership.user_id = p_user_id
        and membership.organization_id = v_invite.organization_id
      order by (membership.status = 'active') desc, membership.created_at asc
      limit 1
      for update;

      if v_project_membership_id is null then
        insert into public.project_user_memberships (
          project_id, user_id, organization_id, access_role, status, created_by
        ) values (
          v_invite.project_id,
          p_user_id,
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

    -- Viewer owner link
    if v_invite.organization_role = 'viewer' then
      update public.project_owners owner
      set viewer_user_id = p_user_id,
          updated_at = now()
      where owner.viewer_invitation_id = v_invite.id;

      update public.project_participants participant
      set key_contact_user_id = p_user_id,
          updated_at = now()
      from public.project_owners owner
      where owner.viewer_invitation_id = v_invite.id
        and participant.project_id = owner.project_id
        and participant.source_key = 'owner:' || owner.id::text;
    end if;

    -- Mark invitation accepted
    update public.invitations
    set status = 'accepted',
        accepted_by = p_user_id,
        updated_at = now()
    where id = v_invite.id
      and status = 'pending';

    -- Audit log
    insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, organization_id, project_id, metadata
    ) values (
      p_user_id,
      'invitation.accepted',
      'invitation',
      v_invite.id,
      v_invite.organization_id,
      v_invite.project_id,
      jsonb_build_object('email', v_user_email, 'auto_accepted', true)
    );

    v_accepted_count := v_accepted_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'count', v_accepted_count);
end;
$$;

revoke all on function public.accept_pending_invitations_for_user(uuid) from public, anon;
grant execute on function public.accept_pending_invitations_for_user(uuid) to authenticated, service_role;

-- Backfill: auto accept pending invitations for all existing accounts in auth.users
do $$
declare
  u record;
begin
  for u in select id from auth.users loop
    perform public.accept_pending_invitations_for_user(u.id);
  end loop;
end;
$$;
