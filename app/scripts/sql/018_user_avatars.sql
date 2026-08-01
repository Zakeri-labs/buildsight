-- ============================================================
-- User profile avatars
-- Private Storage bucket. Object paths use: <profile_id>/<uuid>.<ext>
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-avatars',
  'user-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.avatar_profile_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public, storage
as $$
declare
  folders text[];
begin
  folders := storage.foldername(object_name);
  if coalesce(array_length(folders, 1), 0) < 1 then
    return null;
  end if;
  return folders[1]::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

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
  );
$$;

drop policy if exists user_avatars_select on storage.objects;
create policy user_avatars_select on storage.objects for select
using (
  bucket_id = 'user-avatars'
  and public.avatar_profile_id(name) is not null
  and (
    public.avatar_profile_id(name) = auth.uid()
    or public.shares_scope_with(public.avatar_profile_id(name))
  )
);

drop policy if exists user_avatars_insert on storage.objects;
create policy user_avatars_insert on storage.objects for insert
with check (
  bucket_id = 'user-avatars'
  and public.avatar_profile_id(name) is not null
  and public.can_manage_profile_avatar(public.avatar_profile_id(name))
);

drop policy if exists user_avatars_update on storage.objects;
create policy user_avatars_update on storage.objects for update
using (
  bucket_id = 'user-avatars'
  and public.avatar_profile_id(name) is not null
  and public.can_manage_profile_avatar(public.avatar_profile_id(name))
)
with check (
  bucket_id = 'user-avatars'
  and public.avatar_profile_id(name) is not null
  and public.can_manage_profile_avatar(public.avatar_profile_id(name))
);

drop policy if exists user_avatars_delete on storage.objects;
create policy user_avatars_delete on storage.objects for delete
using (
  bucket_id = 'user-avatars'
  and public.avatar_profile_id(name) is not null
  and public.can_manage_profile_avatar(public.avatar_profile_id(name))
);
