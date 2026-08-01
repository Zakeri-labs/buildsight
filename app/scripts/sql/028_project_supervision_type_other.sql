-- Optional custom label used when a project's supervision_type is "other".
alter table public.projects
  add column if not exists supervision_type_other text;

comment on column public.projects.supervision_type_other is
  'Custom user-entered supervision description used only when supervision_type is other.';
