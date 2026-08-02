-- ============================================================
-- Existing-project image management and project-participant avatars
-- Reuses the project-images and user-avatars private buckets.
-- ============================================================

-- Existing projects may only receive/replace cover-image objects from a
-- project administrator or the supervising organization's administrator.
drop policy if exists project_images_insert on storage.objects;
create policy project_images_insert on storage.objects for insert
with check (
  bucket_id = 'project-images'
  and split_part(name, '/', 2) = auth.uid()::text
  and (
    public.is_project_admin(public.project_image_project_id(name))
    or public.is_supervising_org_admin(public.project_image_project_id(name))
  )
);

-- Extend the existing avatar permission helper so a project administrator can
-- manage an active project member's avatar or the linked key contact avatar on
-- a project participant row. Self-management and organization-admin behaviour
-- remain unchanged.
create or replace function public.can_manage_profile_avatar(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id = auth.uid()
  or exists (
    select 1
    from organization_memberships admin_membership
    join organization_memberships target_membership
      on target_membership.organization_id = admin_membership.organization_id
    where admin_membership.user_id = auth.uid()
      and admin_membership.role = 'org_admin'
      and admin_membership.status = 'active'
      and target_membership.user_id = target_user_id
      and target_membership.status = 'active'
  )
  or exists (
    select 1
    from project_user_memberships admin_membership
    join project_user_memberships target_membership
      on target_membership.project_id = admin_membership.project_id
    where admin_membership.user_id = auth.uid()
      and admin_membership.access_role = 'project_admin'
      and admin_membership.status = 'active'
      and target_membership.user_id = target_user_id
      and target_membership.status = 'active'
  )
  or exists (
    select 1
    from project_user_memberships admin_membership
    join project_participants participant
      on participant.project_id = admin_membership.project_id
    where admin_membership.user_id = auth.uid()
      and admin_membership.access_role = 'project_admin'
      and admin_membership.status = 'active'
      and participant.key_contact_user_id = target_user_id
      and participant.status = 'active'
  );
$$;

comment on function public.can_manage_profile_avatar(uuid) is
  'Allows self-management, active organization admins, and active project admins to manage avatars within their permitted organization/project scope.';
