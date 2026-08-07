-- Backfill canonical Viewer -> Project Owner identity for legacy projects.
--
-- Background:
-- The original "Select Existing Viewer" owner picker only copied the Viewer
-- name/email into project_owners. It did not persist the immutable Viewer user
-- id, and the generated owner participant also had key_contact_user_id = null.
-- Migration 056 introduced project_owners.viewer_user_id and secure Viewer
-- project isolation, but those legacy rows therefore remained unlinked.
--
-- This migration is a one-time reconciliation only. Runtime authorization
-- continues to use project_owners.viewer_user_id exclusively; editable Owner
-- text/email is never consulted by RLS or application authorization.

-- 1) Reconcile any Owner rows that already carry an accepted invitation link.
-- This path is fully canonical and does not use editable Owner text.
with accepted_invitation_links as (
  select
    owner.id as owner_id,
    invitation.accepted_by as viewer_user_id,
    row_number() over (
      partition by owner.project_id, invitation.accepted_by
      order by owner.owner_order asc, owner.created_at asc, owner.id asc
    ) as owner_rank
  from public.project_owners owner
  join public.projects project
    on project.id = owner.project_id
  join public.invitations invitation
    on invitation.id = owner.viewer_invitation_id
   and invitation.organization_id = project.supervising_organization_id
   and invitation.organization_role = 'viewer'
   and invitation.status = 'accepted'
   and invitation.accepted_by is not null
  join public.organization_memberships membership
    on membership.organization_id = project.supervising_organization_id
   and membership.user_id = invitation.accepted_by
   and membership.status = 'active'
   and membership.role = 'viewer'
  where owner.viewer_user_id is null
)
update public.project_owners owner
set viewer_user_id = candidate.viewer_user_id,
    updated_at = now()
from accepted_invitation_links candidate
where candidate.owner_id = owner.id
  and candidate.owner_rank = 1
  and not exists (
    select 1
    from public.project_owners existing
    where existing.project_id = owner.project_id
      and existing.viewer_user_id = candidate.viewer_user_id
      and existing.id <> owner.id
  );

-- 2) Reconcile the exact legacy selector shape used before migration 056.
--
-- The old registered-Viewer picker copied BOTH the profile email and the
-- profile full name into the Owner snapshot while dropping the selected UUID.
-- To avoid turning ordinary/manual Owner text into a runtime security boundary,
-- this one-time backfill links only rows with one unambiguous active Viewer
-- candidate in the same supervising organization AND an exact normalized email
-- match AND an exact current profile-name match in either Owner name field.
-- Ambiguous rows are intentionally left unlinked for explicit Admin repair.
with legacy_candidates as (
  select
    owner.id as owner_id,
    owner.project_id,
    membership.user_id as viewer_user_id,
    count(*) over (partition by owner.id) as candidate_count,
    row_number() over (
      partition by owner.project_id, membership.user_id
      order by owner.owner_order asc, owner.created_at asc, owner.id asc
    ) as owner_rank
  from public.project_owners owner
  join public.projects project
    on project.id = owner.project_id
  join public.organization_memberships membership
    on membership.organization_id = project.supervising_organization_id
   and membership.status = 'active'
   and membership.role = 'viewer'
  join public.profiles profile
    on profile.id = membership.user_id
  where owner.viewer_user_id is null
    and owner.viewer_invitation_id is null
    and owner.contact_email is not null
    and btrim(owner.contact_email) <> ''
    and profile.email is not null
    and btrim(profile.email) <> ''
    and lower(btrim(owner.contact_email)) = lower(btrim(profile.email))
    and profile.full_name is not null
    and btrim(profile.full_name) <> ''
    and (
      lower(btrim(owner.name)) = lower(btrim(profile.full_name))
      or lower(btrim(coalesce(owner.contact_name, ''))) = lower(btrim(profile.full_name))
    )
),
unique_legacy_links as (
  select owner_id, project_id, viewer_user_id
  from legacy_candidates
  where candidate_count = 1
    and owner_rank = 1
)
update public.project_owners owner
set viewer_user_id = candidate.viewer_user_id,
    updated_at = now()
from unique_legacy_links candidate
where candidate.owner_id = owner.id
  and not exists (
    select 1
    from public.project_owners existing
    where existing.project_id = candidate.project_id
      and existing.viewer_user_id = candidate.viewer_user_id
      and existing.id <> owner.id
  );

-- Keep the canonical Owner participant identity synchronized for existing
-- project-scoped read/request helpers. This is derived only from the now-linked
-- immutable Owner UUID, never from Owner email at runtime.
update public.project_participants participant
set key_contact_user_id = owner.viewer_user_id,
    updated_at = now()
from public.project_owners owner
where owner.viewer_user_id is not null
  and participant.project_id = owner.project_id
  and participant.source_key = 'owner:' || owner.id::text
  and participant.key_contact_user_id is distinct from owner.viewer_user_id;

-- No policy broadening is required. Migration 056 RLS/project helpers already
-- authorize owner Viewers through project_owners.viewer_user_id, so once legacy
-- rows are reconciled the same canonical identity powers /projects, direct
-- project URLs, project-scoped reads, images, and Client Visit Requests.
