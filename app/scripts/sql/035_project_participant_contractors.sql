-- Complete contractor support inside the existing project_participants architecture.
-- Existing participant rows, users, access memberships, and RLS policies are preserved.

alter table public.project_participants
  add column if not exists contractor_role text,
  add column if not exists contractor_role_other text,
  add column if not exists access_membership_id uuid references public.project_user_memberships(id) on delete set null;

alter table public.project_participants
  drop constraint if exists project_participants_contractor_role_check;

alter table public.project_participants
  add constraint project_participants_contractor_role_check
  check (
    contractor_role is null
    or contractor_role in (
      'main_contractor',
      'mep_contractor',
      'electrical_contractor',
      'mechanical_contractor',
      'civil_contractor',
      'interior_contractor',
      'landscape_contractor',
      'subcontractor',
      'other'
    )
  );


alter table public.project_participants
  drop constraint if exists project_participants_contractor_type_check;

alter table public.project_participants
  add constraint project_participants_contractor_type_check
  check (
    contractor_role is null
    or participant_type in ('contractor', 'subcontractor')
  );

alter table public.project_participants
  drop constraint if exists project_participants_contractor_other_check;

alter table public.project_participants
  add constraint project_participants_contractor_other_check
  check (
    contractor_role <> 'other'
    or nullif(btrim(contractor_role_other), '') is not null
  );

create index if not exists project_participants_access_membership_idx
  on public.project_participants (access_membership_id)
  where access_membership_id is not null;

comment on column public.project_participants.contractor_role is
  'Optional internal contractor specialization key for contractor participant rows.';
comment on column public.project_participants.contractor_role_other is
  'Custom contractor specialization shown when contractor_role is other.';
comment on column public.project_participants.access_membership_id is
  'Project user membership created by the participant workflow; only this linked membership is revoked when the participant is removed.';
