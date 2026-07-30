-- Persist the exact user-facing participant role selected in Project Details.
-- Existing project_role and participant_type values remain unchanged.

alter table public.project_participants
  add column if not exists participant_role_label text;

comment on column public.project_participants.participant_role_label is
  'Optional user-facing role label for a registered project participant. Legacy records fall back to project_role.';
