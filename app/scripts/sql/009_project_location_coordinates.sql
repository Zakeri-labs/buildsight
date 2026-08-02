-- Store precise project coordinates alongside the existing readable location.
alter table public.projects
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

-- Existing projects remain valid. Clear only incomplete or invalid coordinate pairs
-- before adding constraints, while preserving their readable location text.
update public.projects
set latitude = null,
    longitude = null
where (latitude is null) <> (longitude is null)
   or latitude not between -90 and 90
   or longitude not between -180 and 180;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_coordinates_pair' and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_coordinates_pair
      check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null)) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'projects_latitude_range' and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_latitude_range
      check (latitude is null or latitude between -90 and 90) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'projects_longitude_range' and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_longitude_range
      check (longitude is null or longitude between -180 and 180) not valid;
  end if;
end $$;

alter table public.projects validate constraint projects_coordinates_pair;
alter table public.projects validate constraint projects_latitude_range;
alter table public.projects validate constraint projects_longitude_range;
