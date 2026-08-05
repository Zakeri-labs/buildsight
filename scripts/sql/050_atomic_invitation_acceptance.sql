-- Request-scoped, email-bound, atomic organization invitation acceptance.
-- The complete membership/activation/invitation update runs in one transaction.

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

  select i.*
    into v_invite
  from public.invitations i
  where i.token = p_token
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

  -- Ensure the profile row exists before membership foreign keys are written.
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

  if not exists (select 1 from public.profiles p where p.id = v_user_id) then
    return jsonb_build_object('ok', false, 'code', 'profile_unavailable');
  end if;

  -- Serialize membership changes for the same user and organization, including
  -- concurrent invitations scoped to different projects.
  perform pg_advisory_xact_lock(
    hashtextextended(v_invite.organization_id::text || ':' || v_user_id::text, 0)
  );

  select m.id
    into v_org_membership_id
  from public.organization_memberships m
  where m.organization_id = v_invite.organization_id
    and m.user_id = v_user_id
  order by (m.status = 'active') desc, m.created_at asc
  limit 1
  for update;

  if v_org_membership_id is null then
    insert into public.organization_memberships (
      organization_id,
      user_id,
      role,
      status
    ) values (
      v_invite.organization_id,
      v_user_id,
      v_invite.organization_role,
      'active'
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
    select m.id
      into v_project_membership_id
    from public.project_user_memberships m
    where m.project_id = v_invite.project_id
      and m.user_id = v_user_id
      and m.organization_id = v_invite.organization_id
    order by (m.status = 'active') desc, m.created_at asc
    limit 1
    for update;

    if v_project_membership_id is null then
      insert into public.project_user_memberships (
        project_id,
        user_id,
        organization_id,
        access_role,
        status,
        created_by
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
    actor_id,
    action,
    entity_type,
    entity_id,
    organization_id,
    project_id,
    metadata
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
