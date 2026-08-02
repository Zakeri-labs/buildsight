-- Repair organization creation for the expanded company-profile form.
-- Keeps the existing organizations table and Pending approval workflow.

alter table public.organizations
  add column if not exists organization_category text,
  add column if not exists contact_person text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists registration_number text,
  add column if not exists address text,
  add column if not exists postal_code text,
  add column if not exists website text;

update public.organizations
set organization_category = 'other'
where organization_category is not null
  and organization_category not in ('contractor', 'client', 'supplier', 'consultant', 'other');

alter table public.organizations
  drop constraint if exists organizations_category_check;

alter table public.organizations
  add constraint organizations_category_check
  check (
    organization_category is null
    or organization_category in ('contractor', 'client', 'supplier', 'consultant', 'other')
  );

create or replace function public.create_external_organization(
  p_supervising_organization_id uuid,
  p_name text,
  p_organization_category text,
  p_contact_person text default null,
  p_email text default null,
  p_phone text default null,
  p_registration_number text default null,
  p_address text default null,
  p_postal_code text default null,
  p_website text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  created_id uuid;
  clean_name text := nullif(btrim(p_name), '');
  clean_category text := lower(nullif(btrim(p_organization_category), ''));
begin
  if actor_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_org_admin(p_supervising_organization_id) then
    raise exception 'You must be an organization admin' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organizations
    where id = p_supervising_organization_id
      and type = 'supervising'
  ) then
    raise exception 'Only a supervising organization can create organizations' using errcode = '42501';
  end if;

  if clean_name is null or char_length(clean_name) < 2 then
    raise exception 'Organization name is too short' using errcode = '22023';
  end if;

  if clean_category is null
     or clean_category not in ('contractor', 'client', 'supplier', 'consultant', 'other') then
    raise exception 'Select a valid organization type' using errcode = '22023';
  end if;

  insert into public.organizations (
    name,
    type,
    organization_category,
    contact_person,
    email,
    phone,
    registration_number,
    address,
    postal_code,
    website,
    status,
    created_by
  )
  values (
    clean_name,
    'external',
    clean_category,
    nullif(btrim(p_contact_person), ''),
    lower(nullif(btrim(p_email), '')),
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_registration_number), ''),
    nullif(btrim(p_address), ''),
    nullif(btrim(p_postal_code), ''),
    nullif(btrim(p_website), ''),
    'pending',
    actor_id
  )
  returning id into created_id;

  return created_id;
end;
$$;

revoke all on function public.create_external_organization(
  uuid, text, text, text, text, text, text, text, text, text
) from public;

grant execute on function public.create_external_organization(
  uuid, text, text, text, text, text, text, text, text, text
) to authenticated;

create index if not exists organizations_category_status_idx
  on public.organizations (organization_category, status, name);

comment on column public.organizations.organization_category is
  'Reusable business classification shown as Organization Type. Separate from the internal supervising/external tenancy type.';
comment on column public.organizations.contact_person is
  'Optional primary organization contact person.';
comment on column public.organizations.email is
  'Optional reusable organization contact email.';
comment on column public.organizations.website is
  'Optional organization website.';

comment on function public.create_external_organization(
  uuid, text, text, text, text, text, text, text, text, text
) is 'Atomically creates a Pending external organization with its reusable company profile after verifying the caller is an admin of the supervising organization.';
