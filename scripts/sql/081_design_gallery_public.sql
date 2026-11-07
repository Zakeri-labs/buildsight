-- ============================================================
-- Design gallery, part 2: public pages.
--
--   design_gallery_sites.logo_url / website_url
--       shown in the public page header (logo) and linked from it (website).
--   design_gallery_events
--       anonymous page views and contact clicks, used for the monthly figures
--       (which designs are opened, how many visitors contact or book).
--       No personal data: no IP, no user agent, no names.
--       Written only by the server (service role); read only by org admins.
-- Requires 079_design_gallery.sql.
-- ============================================================

alter table public.design_gallery_sites
  add column if not exists logo_url text,
  add column if not exists website_url text;

alter table public.design_gallery_sites drop constraint if exists design_gallery_sites_logo_url_format;
alter table public.design_gallery_sites add constraint design_gallery_sites_logo_url_format
  check (logo_url is null or logo_url ~ '^(/[A-Za-z0-9._/-]+|https://[^\s"''<>]+)$');

alter table public.design_gallery_sites drop constraint if exists design_gallery_sites_website_url_format;
alter table public.design_gallery_sites add constraint design_gallery_sites_website_url_format
  check (website_url is null or website_url ~ '^https?://[^\s"''<>]+$');

create table if not exists public.design_gallery_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  design_id uuid references public.designs(id) on delete set null,
  event_type text not null,
  intent text,
  locale text,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz not null default now(),
  constraint design_gallery_events_type check (event_type in ('gallery_view', 'design_view', 'contact_click')),
  constraint design_gallery_events_intent check (intent is null or intent in ('same', 'modified', 'question', 'similar', 'idea', 'general')),
  constraint design_gallery_events_locale check (locale is null or locale in ('ar', 'en')),
  constraint design_gallery_events_lengths check (
    coalesce(length(referrer_host), 0) <= 255
    and coalesce(length(utm_source), 0) <= 100
    and coalesce(length(utm_medium), 0) <= 100
    and coalesce(length(utm_campaign), 0) <= 100
  )
);

create index if not exists design_gallery_events_org_time_idx
  on public.design_gallery_events (organization_id, created_at desc);
create index if not exists design_gallery_events_design_idx
  on public.design_gallery_events (design_id, event_type);

alter table public.design_gallery_events enable row level security;
revoke insert, update, delete on public.design_gallery_events from anon, authenticated;

drop policy if exists design_gallery_events_select on public.design_gallery_events;
create policy design_gallery_events_select on public.design_gallery_events for select
  using (public.is_org_admin(organization_id));

-- Bonyan's header logo and website, only where not set yet.
update public.design_gallery_sites
set logo_url = coalesce(logo_url, '/Logow.png'),
    website_url = coalesce(website_url, 'https://bonyanec.com')
where slug = 'bonyan';
