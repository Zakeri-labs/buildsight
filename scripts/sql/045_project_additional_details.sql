-- Additional project details used by the existing creation and edit flows.
alter table public.projects
  add column if not exists plot_no text,
  add column if not exists supervision_start_date date,
  add column if not exists priority text default 'medium',
  add column if not exists included_structure_visits integer,
  add column if not exists included_finishing_visits integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_priority_allowed'
  ) then
    alter table public.projects
      add constraint projects_priority_allowed
      check (priority is null or priority in ('low', 'medium', 'high', 'urgent'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_included_structure_visits_nonnegative'
  ) then
    alter table public.projects
      add constraint projects_included_structure_visits_nonnegative
      check (included_structure_visits is null or included_structure_visits >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_included_finishing_visits_nonnegative'
  ) then
    alter table public.projects
      add constraint projects_included_finishing_visits_nonnegative
      check (included_finishing_visits is null or included_finishing_visits >= 0);
  end if;
end;
$$;
