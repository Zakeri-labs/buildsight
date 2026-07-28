-- ============================================================
-- Project participant avatars
-- Avatars belong to project_participants, including external contacts.
-- Object paths: <project_id>/<participant_id>/<uuid>.<ext>
-- ============================================================

-- Reassert the existing private project-image bucket so deployments with a
-- missing or partially applied earlier Storage migration can recover safely.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-images',
  'project-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.project_participants
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'participant-avatars',
  'participant-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.participant_avatar_project_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function public.participant_avatar_participant_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return split_part(object_name, '/', 2)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function public.participant_avatar_matches_record(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_participants participant
    where participant.id = public.participant_avatar_participant_id(object_name)
      and participant.project_id = public.participant_avatar_project_id(object_name)
  );
$$;

comment on column public.project_participants.avatar_url is
  'Private participant-avatar Storage path. This belongs to the participant record and does not require a linked system user.';

comment on function public.participant_avatar_matches_record(text) is
  'Validates that a participant-avatar object path belongs to an existing participant in the stated project.';

drop policy if exists participant_avatars_select on storage.objects;
create policy participant_avatars_select on storage.objects for select
using (
  bucket_id = 'participant-avatars'
  and public.participant_avatar_matches_record(name)
  and (
    public.is_project_member(public.participant_avatar_project_id(name))
    or public.is_supervising_org_admin(public.participant_avatar_project_id(name))
  )
);

drop policy if exists participant_avatars_insert on storage.objects;
create policy participant_avatars_insert on storage.objects for insert
with check (
  bucket_id = 'participant-avatars'
  and public.participant_avatar_matches_record(name)
  and (
    public.is_project_admin(public.participant_avatar_project_id(name))
    or public.is_supervising_org_admin(public.participant_avatar_project_id(name))
  )
);

drop policy if exists participant_avatars_update on storage.objects;
create policy participant_avatars_update on storage.objects for update
using (
  bucket_id = 'participant-avatars'
  and public.participant_avatar_matches_record(name)
  and (
    public.is_project_admin(public.participant_avatar_project_id(name))
    or public.is_supervising_org_admin(public.participant_avatar_project_id(name))
  )
)
with check (
  bucket_id = 'participant-avatars'
  and public.participant_avatar_matches_record(name)
  and (
    public.is_project_admin(public.participant_avatar_project_id(name))
    or public.is_supervising_org_admin(public.participant_avatar_project_id(name))
  )
);

drop policy if exists participant_avatars_delete on storage.objects;
create policy participant_avatars_delete on storage.objects for delete
using (
  bucket_id = 'participant-avatars'
  and public.participant_avatar_matches_record(name)
  and (
    public.is_project_admin(public.participant_avatar_project_id(name))
    or public.is_supervising_org_admin(public.participant_avatar_project_id(name))
  )
);
