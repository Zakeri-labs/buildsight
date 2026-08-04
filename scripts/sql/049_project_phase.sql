-- Optional free-text project phase captured during project creation.
alter table public.projects
  add column if not exists phase text;
