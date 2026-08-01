-- Complete reusable organization/company profiles for organization creation and project contractor selection.
-- Existing organization profile and project snapshot fields are preserved.

alter table public.organizations
  add column if not exists organization_category text,
  add column if not exists contact_person text,
  add column if not exists email text,
  add column if not exists website text;

alter table public.organizations
  drop constraint if exists organizations_category_check;

alter table public.organizations
  add constraint organizations_category_check
  check (
    organization_category is null
    or organization_category in ('contractor', 'client', 'supplier', 'consultant', 'other')
  );

create index if not exists organizations_category_status_idx
  on public.organizations (organization_category, status, name);

comment on column public.organizations.organization_category is
  'Reusable business classification shown as Organization Type. This is separate from the internal supervising/external tenancy type.';
comment on column public.organizations.contact_person is
  'Optional primary organization contact person.';
comment on column public.organizations.email is
  'Optional reusable organization contact email.';
comment on column public.organizations.website is
  'Optional organization website.';
