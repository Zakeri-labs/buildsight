-- ============================================================
-- Replace the active global Stage library with the required 27-stage list.
--
-- Existing Stage definitions are archived rather than deleted so that all
-- project assignments, Terms, Sub-terms, Reports, responses, inspections,
-- attachments, approvals, and progress history remain intact.
--
-- Existing Stage rows whose names exactly match a required definition are
-- reused. All other required definitions are inserted. The active library for
-- every supervising organization is therefore exactly the 27 names below.
-- ============================================================

create or replace function public.seed_default_stage_templates(target_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_stage record;
  existing_stage_id uuid;
begin
  if target_organization_id is null then
    return;
  end if;

  -- Preserve legacy definitions and every relationship that points to them,
  -- but remove them from the active reusable library.
  update public.stages
  set is_active = false,
      updated_at = now()
  where organization_id = target_organization_id
    and is_active = true;

  for desired_stage in
    select *
    from (
      values
        (1,  'Earth work Excavation'),
        (2,  'PCC'),
        (3,  'Footing'),
        (4,  'Retaining wall steel fabrication and Formwork'),
        (5,  'Short column shuttering'),
        (6,  'Plinth beam'),
        (7,  'Bitumen application'),
        (8,  'Water Proofing'),
        (9,  'Backfilling'),
        (10, 'Slabs and beams shuttering'),
        (11, 'Slabs and beams steel fabrication'),
        (12, 'Grade slab'),
        (13, 'Column steel Fabrication'),
        (14, 'Column Shuttering work'),
        (15, 'Block work'),
        (16, 'Concealed work before plastering & Plaster preparation'),
        (17, 'Plastering'),
        (18, 'Floor tiling'),
        (19, 'Wall tiles'),
        (20, 'plumbing work'),
        (21, 'Electrical work'),
        (22, 'Septic tank or Holding tank'),
        (23, 'Painting work'),
        (24, 'External drainage'),
        (25, 'Completion'),
        (26, 'Testing & Commissioning'),
        (27, 'Testing & Commissioning.xlsx')
    ) as required_stages(sort_order, name)
  loop
    existing_stage_id := null;

    select stage.id
      into existing_stage_id
    from public.stages stage
    where stage.organization_id = target_organization_id
      and lower(stage.name) = lower(desired_stage.name)
    order by stage.created_at asc, stage.id asc
    limit 1;

    if existing_stage_id is null then
      insert into public.stages (
        organization_id,
        name,
        description,
        is_active,
        sort_order,
        created_at,
        updated_at
      )
      values (
        target_organization_id,
        desired_stage.name,
        null,
        true,
        desired_stage.sort_order,
        now(),
        now()
      );
    else
      -- Reuse an exact/equivalent existing definition so any linked global
      -- Terms and project assignments remain connected. The requested display
      -- spelling and order become canonical.
      update public.stages
      set name = desired_stage.name,
          description = null,
          is_active = true,
          sort_order = desired_stage.sort_order,
          updated_at = now()
      where id = existing_stage_id;
    end if;
  end loop;
end;
$$;

-- Preserve every existing project's execution snapshot. Updating a reused
-- global Stage can invoke the existing definition-sync trigger; these values
-- are restored after the library replacement so current project workflows do
-- not change name, description, or order.
drop table if exists pg_temp.stage_project_snapshot_043;
create temporary table stage_project_snapshot_043 on commit drop as
select id, name, description, sort_order
from public.project_stages;

-- Replace the active library for every existing supervising organization.
do $$
declare
  organization_record record;
begin
  for organization_record in
    select id
    from public.organizations
    where type = 'supervising'
  loop
    perform public.seed_default_stage_templates(organization_record.id);
  end loop;
end;
$$;

update public.project_stages project_stage
set name = snapshot.name,
    description = snapshot.description,
    sort_order = snapshot.sort_order,
    updated_at = now()
from stage_project_snapshot_043 snapshot
where project_stage.id = snapshot.id
  and (
    project_stage.name is distinct from snapshot.name
    or project_stage.description is distinct from snapshot.description
    or project_stage.sort_order is distinct from snapshot.sort_order
  );

-- Safety assertion: fail the migration rather than leave a partial library.
do $$
declare
  invalid_organization_id uuid;
  invalid_active_stage_count bigint;
begin
  select organization.id,
         count(stage.id) filter (where stage.is_active = true) as active_stage_count
    into invalid_organization_id, invalid_active_stage_count
  from public.organizations organization
  left join public.stages stage on stage.organization_id = organization.id
  where organization.type = 'supervising'
  group by organization.id
  having count(stage.id) filter (where stage.is_active = true) <> 27
  limit 1;

  if invalid_organization_id is not null then
    raise exception 'Stage library replacement failed for organization %: expected 27 active stages, found %',
      invalid_organization_id,
      invalid_active_stage_count;
  end if;
end;
$$;
