-- ============================================================
-- Provision domain data: project details + construction records
-- Reads are performed by the audited service-role data layer
-- (lib/db/domain.ts) scoped to the supervising org's projects.
-- RLS is enabled with no policies => deny-by-default for the
-- anon/authenticated keys; the service role bypasses RLS.
-- ============================================================

-- ---------- projects: display / detail columns ----------
alter table public.projects add column if not exists image text;
alter table public.projects add column if not exists our_role text;            -- consultancy role for portfolio display
alter table public.projects add column if not exists contractor text;
alter table public.projects add column if not exists consultant text;
alter table public.projects add column if not exists client text;
alter table public.projects add column if not exists start_date date;
alter table public.projects add column if not exists target_handover date;
alter table public.projects add column if not exists contract_value text;
alter table public.projects add column if not exists progress_planned int not null default 0;
alter table public.projects add column if not exists progress_actual int not null default 0;
alter table public.projects add column if not exists progress_delay int not null default 0;
alter table public.projects add column if not exists sort_order int not null default 0;

-- ---------- ncrs ----------
create table if not exists public.ncrs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  title text not null,
  discipline text not null,
  location text,
  severity text not null default 'minor',      -- critical | major | minor
  status text not null default 'open',          -- open | in-review | closed
  raised_by text,
  raised_on date,
  assigned_to text,
  assigned_initials text,
  due_date date,
  description text,
  root_cause text,
  corrective_action text,
  linked_inspection text,
  created_at timestamptz not null default now()
);
create index if not exists ncrs_project_idx on public.ncrs (project_id);

-- ---------- inspections ----------
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  title text not null,
  discipline text not null,
  location text,
  requested_by text,
  assigned_to text,
  assigned_initials text,
  scheduled text,
  due_date date,
  overdue boolean not null default false,
  priority text not null default 'medium',      -- high | medium | low
  status text not null default 'pending',        -- pending | approved | rejected | in-progress
  linked_ncr text,
  created_at timestamptz not null default now()
);
create index if not exists inspections_project_idx on public.inspections (project_id);

-- ---------- rfis ----------
create table if not exists public.rfis (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  subject text not null,
  discipline text not null,
  status text not null default 'open',            -- open | answered | closed
  priority text not null default 'medium',
  submitted_by text,
  submitted_on date,
  due_date date,
  question text,
  response text,
  created_at timestamptz not null default now()
);
create index if not exists rfis_project_idx on public.rfis (project_id);

-- ---------- variation_orders ----------
create table if not exists public.variation_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  title text not null,
  status text not null default 'submitted',       -- draft | submitted | approved | rejected
  amount numeric(14,2) not null default 0,
  currency text not null default 'AED',
  submitted_by text,
  submitted_on date,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists vo_project_idx on public.variation_orders (project_id);

-- ---------- tasks (My Tasks) ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  action text not null,
  type text not null,                             -- NCR | Inspection | RFI | VO
  reference text,
  due_label text,
  due_tone text not null default 'muted',         -- danger | warning | muted
  assignee_id uuid references public.profiles(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists tasks_project_idx on public.tasks (project_id);

-- ---------- activity_log (dashboard feed) ----------
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  type text not null,                             -- ncr | inspection | rfi | vo | document
  verb text not null,
  reference text,
  created_at timestamptz not null default now()
);
create index if not exists activity_project_idx on public.activity_log (project_id);

-- ---------- RLS (deny-by-default; service role bypasses) ----------
alter table public.ncrs enable row level security;
alter table public.inspections enable row level security;
alter table public.rfis enable row level security;
alter table public.variation_orders enable row level security;
alter table public.tasks enable row level security;
alter table public.activity_log enable row level security;
