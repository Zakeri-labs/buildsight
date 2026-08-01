-- Registered contractor company profile fields used to prefill Add Project Step 3.
-- Project creation continues to save editable project-specific snapshots on public.projects.
-- The Add Project wizard never updates these global organization fields.

alter table public.organizations
  add column if not exists registration_number text,
  add column if not exists address text,
  add column if not exists postal_code text,
  add column if not exists phone text;

comment on column public.organizations.registration_number is
  'Optional organization-level commercial registration / CR number used as a reusable contractor profile default.';
comment on column public.organizations.address is
  'Optional organization-level address used as a reusable contractor profile default.';
comment on column public.organizations.postal_code is
  'Optional organization-level postal code used as a reusable contractor profile default.';
comment on column public.organizations.phone is
  'Optional organization-level phone number used as a reusable contractor profile default.';

-- Preserve existing project snapshots and use the newest available snapshot only to fill
-- currently missing global contractor profile values. Existing organization values win.
with latest_contractor_snapshot as (
  select distinct on (p.contractor_organization_id)
    p.contractor_organization_id as organization_id,
    nullif(btrim(p.contractor_registration_number), '') as registration_number,
    nullif(btrim(p.contractor_address), '') as address,
    nullif(btrim(p.contractor_postal_code), '') as postal_code,
    nullif(btrim(p.contractor_phone), '') as phone
  from public.projects p
  where p.contractor_organization_id is not null
  order by p.contractor_organization_id, p.updated_at desc nulls last, p.created_at desc
)
update public.organizations o
set
  registration_number = coalesce(nullif(btrim(o.registration_number), ''), s.registration_number),
  address = coalesce(nullif(btrim(o.address), ''), s.address),
  postal_code = coalesce(nullif(btrim(o.postal_code), ''), s.postal_code),
  phone = coalesce(nullif(btrim(o.phone), ''), s.phone)
from latest_contractor_snapshot s
where o.id = s.organization_id
  and (
    nullif(btrim(o.registration_number), '') is null
    or nullif(btrim(o.address), '') is null
    or nullif(btrim(o.postal_code), '') is null
    or nullif(btrim(o.phone), '') is null
  );
