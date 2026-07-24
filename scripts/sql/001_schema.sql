-- ============================================================
-- Provision multi-tenant schema
-- ============================================================
create extension if not exists "pgcrypto";

-- ---------- Enums ----------
do $$ begin
  create type org_type as enum ('supervising', 'external');
exception when duplicate_object then null; end $$;

do $$ begin
  create type organization_status as enum ('pending', 'invited', 'active', 'suspended');
exception when duplicate_object then null; end $$;

-- Roles a user holds *inside an organization*
do $$ begin
  create type organization_role as enum ('org_admin', 'org_manager', 'org_member', 'viewer');
exception when duplicate_object then null; end $$;

-- Role an *organization* plays inside a project
do $$ begin
  create type project_org_role as enum (
    'consultant', 'client', 'contractor', 'subcontractor', 'government', 'supplier', 'third_party'
  );
exception when duplicate_object then null; end $$;

-- Role a *user* holds inside a project
do $$ begin
  create type project_access_role as enum (
    'project_admin', 'project_manager', 'inspector', 'reviewer', 'approver', 'contributor', 'viewer'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type membership_status as enum ('active', 'inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invitation_status as enum ('pending', 'accepted', 'expired', 'revoked');
exception when duplicate_object then null; end $$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- organizations ----------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type org_type not null default 'external',
  status organization_status not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- An Organization must not be duplicated (case-insensitive name)
create unique index if not exists organizations_name_unique on public.organizations (lower(name));

-- ---------- organization_memberships ----------
create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role organization_role not null default 'org_member',
  status membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One user should only have one active membership per organization
create unique index if not exists org_membership_one_active
  on public.organization_memberships (organization_id, user_id)
  where status = 'active';

-- ---------- projects ----------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  location text,
  status text not null default 'active',
  supervising_organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- project_organization_memberships ----------
create table if not exists public.project_organization_memberships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_role project_org_role not null,
  status membership_status not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One organization should only have one active membership record per project
create unique index if not exists proj_org_membership_one_active
  on public.project_organization_memberships (project_id, organization_id)
  where status = 'active';

-- ---------- project_user_memberships ----------
create table if not exists public.project_user_memberships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  access_role project_access_role not null default 'viewer',
  status membership_status not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One user should only have one active membership per project + organization combination
create unique index if not exists proj_user_membership_one_active
  on public.project_user_memberships (project_id, user_id, organization_id)
  where status = 'active';

-- ---------- invitations ----------
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  organization_role organization_role not null default 'org_admin',
  project_org_role project_org_role,
  project_access_role project_access_role,
  token text not null unique,
  status invitation_status not null default 'pending',
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invitations_email_idx on public.invitations (lower(email));
create index if not exists invitations_org_idx on public.invitations (organization_id);
-- Only one pending invitation per email + org + project scope
create unique index if not exists invitations_one_pending
  on public.invitations (lower(email), organization_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'pending';

-- ---------- audit_logs ----------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  organization_id uuid references public.organizations(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_org_idx on public.audit_logs (organization_id);
create index if not exists audit_logs_project_idx on public.audit_logs (project_id);
