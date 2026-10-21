-- ============================================================
-- Design gallery, part 3: meeting requests (booking).
--
--   design_gallery_sites  + booking settings (time zone, working days and
--                         hours, meeting length, notice, how far ahead,
--                         office address). The Google Calendar account is
--                         server configuration, not stored here, because
--                         gallery settings are readable by the public.
--   design_meeting_requests     one row per booking or "call me" request
--   design_meeting_attachments  images / PDFs sent with an idea (private)
--
-- Customer data: readable only by the organization's org_admin; written
-- only by the server (service role). One meeting per time slot per
-- organization (the team shares one calendar). A repeated submit with the
-- same request_key is the same request (double click, retry).
-- Requires 079.
-- ============================================================

alter table public.design_gallery_sites
  add column if not exists booking_timezone text not null default 'Asia/Muscat',
  add column if not exists booking_work_days smallint[] not null default '{0,1,2,3,4}',
  add column if not exists booking_day_start time not null default '09:00',
  add column if not exists booking_day_end time not null default '17:00',
  add column if not exists booking_slot_minutes smallint not null default 45,
  add column if not exists booking_min_notice_hours smallint not null default 12,
  add column if not exists booking_days_ahead smallint not null default 21,
  add column if not exists office_address_ar text,
  add column if not exists office_address_en text;

alter table public.design_gallery_sites drop constraint if exists design_gallery_sites_booking_hours;
alter table public.design_gallery_sites add constraint design_gallery_sites_booking_hours check (
  booking_day_end > booking_day_start
  and booking_slot_minutes between 15 and 240
  and booking_min_notice_hours between 0 and 168
  and booking_days_ahead between 1 and 90
  and booking_work_days <@ '{0,1,2,3,4,5,6}'::smallint[]
  and coalesce(length(office_address_ar), 0) <= 200
  and coalesce(length(office_address_en), 0) <= 200
);

create table if not exists public.design_meeting_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  design_id uuid references public.designs(id) on delete set null,
  -- Copied when the request is made, so the request still says which design
  -- it was about after the design is renamed or deleted.
  design_code text,
  design_title_ar text,
  design_title_en text,
  request_key uuid not null,
  path text not null,
  client_name text not null,
  whatsapp_phone text not null,
  email text,
  project_type text not null,
  land_status text not null,
  wilayat text,
  land_area_sqm numeric(10, 2),
  start_timeline text not null,
  idea_text text,
  meeting_mode text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'new',
  calendar_status text not null default 'pending',
  calendar_event_id text,
  meet_link text,
  calendar_error text,
  locale text,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint design_meeting_requests_path check (path in ('same', 'modified', 'idea')),
  -- A design request names its design; the design itself may be deleted later.
  constraint design_meeting_requests_design_for_path check ((path = 'idea') or design_code is not null),
  constraint design_meeting_requests_name check (length(btrim(client_name)) between 2 and 100),
  constraint design_meeting_requests_phone check (whatsapp_phone ~ '^[0-9]{8,15}$'),
  constraint design_meeting_requests_email check (email is null or (length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  constraint design_meeting_requests_project_type check (project_type in ('villa', 'residential_complex', 'commercial', 'other')),
  constraint design_meeting_requests_land_status check (land_status in ('owned_ready', 'purchasing', 'no_land')),
  constraint design_meeting_requests_timeline check (start_timeline in ('within_3_months', 'within_year', 'exploring')),
  constraint design_meeting_requests_mode check (meeting_mode in ('remote', 'office', 'call_me')),
  constraint design_meeting_requests_slot check (
    (meeting_mode = 'call_me' and starts_at is null and ends_at is null)
    or (meeting_mode <> 'call_me' and starts_at is not null and ends_at > starts_at)
  ),
  constraint design_meeting_requests_remote_email check (meeting_mode <> 'remote' or email is not null),
  constraint design_meeting_requests_status check (status in ('new', 'confirmed', 'attended', 'quote', 'contract', 'no_show', 'cancelled')),
  constraint design_meeting_requests_calendar_status check (calendar_status in ('pending', 'created', 'not_configured', 'failed', 'not_needed')),
  constraint design_meeting_requests_meet_link check (meet_link is null or meet_link ~ '^https://meet\.google\.com/'),
  constraint design_meeting_requests_lengths check (
    coalesce(length(wilayat), 0) <= 80
    and coalesce(length(idea_text), 0) <= 2000
    and coalesce(length(calendar_error), 0) <= 500
    and coalesce(length(referrer_host), 0) <= 255
    and coalesce(length(utm_source), 0) <= 100
    and coalesce(length(utm_medium), 0) <= 100
    and coalesce(length(utm_campaign), 0) <= 100
    and coalesce(length(design_code), 0) <= 20
    and coalesce(length(design_title_ar), 0) <= 120
    and coalesce(length(design_title_en), 0) <= 120
  ),
  constraint design_meeting_requests_area check (land_area_sqm is null or land_area_sqm > 0),
  constraint design_meeting_requests_locale check (locale is null or locale in ('ar', 'en'))
);

create unique index if not exists design_meeting_requests_key_unique
  on public.design_meeting_requests (organization_id, request_key);
create unique index if not exists design_meeting_requests_org_id_unique
  on public.design_meeting_requests (organization_id, id);
-- The team shares one calendar: one active meeting per start time.
create unique index if not exists design_meeting_requests_one_per_slot
  on public.design_meeting_requests (organization_id, starts_at)
  where starts_at is not null and status <> 'cancelled';
create index if not exists design_meeting_requests_org_time_idx
  on public.design_meeting_requests (organization_id, created_at desc);
create index if not exists design_meeting_requests_org_starts_idx
  on public.design_meeting_requests (organization_id, starts_at)
  where starts_at is not null;

drop trigger if exists design_meeting_requests_touch on public.design_meeting_requests;
create trigger design_meeting_requests_touch before update on public.design_meeting_requests
  for each row execute function public.touch_design_gallery_updated_at();

create table if not exists public.design_meeting_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_id uuid not null,
  storage_path text not null,
  content_type text not null,
  size_bytes integer not null,
  file_name text,
  created_at timestamptz not null default now(),
  constraint design_meeting_attachments_request_same_org foreign key (organization_id, request_id)
    references public.design_meeting_requests (organization_id, id) on delete cascade,
  constraint design_meeting_attachments_type check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  constraint design_meeting_attachments_size check (size_bytes between 1 and 10485760),
  constraint design_meeting_attachments_name check (coalesce(length(file_name), 0) <= 200),
  constraint design_meeting_attachments_path check (
    storage_path ~ ('^' || organization_id::text
                    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
                    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$')
  )
);

create unique index if not exists design_meeting_attachments_path_unique
  on public.design_meeting_attachments (storage_path);

-- The booking form lives at /designs/book: a design cannot use that address.
update public.designs set slug = slug || '-design' where slug in ('book', 'sitemap-xml');

-- ---------- RLS: org admins read; nobody writes through the API ----------
alter table public.design_meeting_requests enable row level security;
alter table public.design_meeting_attachments enable row level security;
revoke insert, update, delete on public.design_meeting_requests, public.design_meeting_attachments from anon, authenticated;

drop policy if exists design_meeting_requests_select on public.design_meeting_requests;
create policy design_meeting_requests_select on public.design_meeting_requests for select
  using (public.is_org_admin(organization_id));

drop policy if exists design_meeting_attachments_select on public.design_meeting_attachments;
create policy design_meeting_attachments_select on public.design_meeting_attachments for select
  using (public.is_org_admin(organization_id));

-- ---------- private bucket for files sent with requests ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'design-meeting-files',
  'design-meeting-files',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
