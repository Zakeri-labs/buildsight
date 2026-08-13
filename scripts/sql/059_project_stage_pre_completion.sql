-- Migration 059: Add is_pre_completed column to project_stages
alter table public.project_stages
  add column if not exists is_pre_completed boolean not null default false;

-- Comment for clarity
comment on column public.project_stages.is_pre_completed is 'Indicates whether this stage was completed prior to project onboarding/start (forces 100% progress)';
