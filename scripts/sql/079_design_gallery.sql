-- ============================================================
-- Design gallery (معرض التصاميم) — multi-organization catalogue
--
-- Each organization can run its own public gallery:
--   design_gallery_sites  one row per organization (public slug, optional custom host)
--   design_categories     the organization's own category list
--   designs               the designs, bilingual, draft/published/archived
--   design_images         ordered images per design; the first image is the cover
--
-- Public (anon) reads are limited to published designs of an enabled site.
-- Members of the organization read everything of their organization.
-- Only org_admin writes. Image files live in the public `design-gallery`
-- bucket under `{organization_id}/{design_id}/{uuid}.{ext}`; uploads are
-- signed by the server after an org_admin check, so no client insert policy
-- is needed on storage.objects.
-- ============================================================

create table if not exists public.design_gallery_sites (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  slug text not null,
  custom_host text,
  is_enabled boolean not null default false,
  display_name_ar text,
  display_name_en text,
  whatsapp_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint design_gallery_sites_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint design_gallery_sites_whatsapp_digits check (whatsapp_phone is null or whatsapp_phone ~ '^[0-9]{8,15}$')
);

create unique index if not exists design_gallery_sites_slug_unique
  on public.design_gallery_sites (slug);
create unique index if not exists design_gallery_sites_host_unique
  on public.design_gallery_sites (lower(custom_host))
  where custom_host is not null;

create table if not exists public.design_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  name_ar text not null,
  name_en text not null,
  sort_order integer not null default 0,
  bookable_by_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint design_categories_key_format check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create unique index if not exists design_categories_org_key_unique
  on public.design_categories (organization_id, key);
create unique index if not exists design_categories_org_id_unique
  on public.design_categories (organization_id, id);

create table if not exists public.designs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid not null,
  slug text not null,
  code text not null,
  title_ar text not null,
  title_en text not null,
  summary_ar text,
  summary_en text,
  description_ar text,
  description_en text,
  floors_ar text,
  floors_en text,
  built_area_sqm numeric(10, 2),
  bedrooms integer,
  service_ar text,
  service_en text,
  is_bookable boolean not null default true,
  status text not null default 'draft',
  sort_order integer not null default 0,
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint designs_status_check check (status in ('draft', 'published', 'archived')),
  constraint designs_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint designs_code_format check (code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'),
  constraint designs_area_positive check (built_area_sqm is null or built_area_sqm > 0),
  constraint designs_bedrooms_range check (bedrooms is null or bedrooms between 0 and 50),
  constraint designs_category_same_org foreign key (organization_id, category_id)
    references public.design_categories (organization_id, id) on delete restrict
);

create unique index if not exists designs_org_slug_unique on public.designs (organization_id, slug);
create unique index if not exists designs_org_code_unique on public.designs (organization_id, code);
create unique index if not exists designs_org_id_unique on public.designs (organization_id, id);
create index if not exists designs_org_status_idx on public.designs (organization_id, status, sort_order);

create table if not exists public.design_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  design_id uuid not null,
  storage_path text not null,
  alt_ar text,
  alt_en text,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  constraint design_images_design_same_org foreign key (organization_id, design_id)
    references public.designs (organization_id, id) on delete cascade
);

create index if not exists design_images_design_order_idx on public.design_images (design_id, order_index);
create unique index if not exists design_images_storage_path_unique on public.design_images (storage_path);

-- ---------- updated_at ----------
create or replace function public.touch_design_gallery_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists design_gallery_sites_touch on public.design_gallery_sites;
create trigger design_gallery_sites_touch before update on public.design_gallery_sites
  for each row execute function public.touch_design_gallery_updated_at();
drop trigger if exists design_categories_touch on public.design_categories;
create trigger design_categories_touch before update on public.design_categories
  for each row execute function public.touch_design_gallery_updated_at();
drop trigger if exists designs_touch on public.designs;
create trigger designs_touch before update on public.designs
  for each row execute function public.touch_design_gallery_updated_at();

-- ---------- visibility helper ----------
create or replace function public.is_design_gallery_public(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from design_gallery_sites
    where organization_id = org and is_enabled
  );
$$;

-- ---------- RLS ----------
alter table public.design_gallery_sites enable row level security;
alter table public.design_categories enable row level security;
alter table public.designs enable row level security;
alter table public.design_images enable row level security;

drop policy if exists design_gallery_sites_select on public.design_gallery_sites;
create policy design_gallery_sites_select on public.design_gallery_sites for select
  using (is_enabled or public.is_org_member(organization_id));
drop policy if exists design_gallery_sites_write on public.design_gallery_sites;
create policy design_gallery_sites_write on public.design_gallery_sites for all
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists design_categories_select on public.design_categories;
create policy design_categories_select on public.design_categories for select
  using (public.is_design_gallery_public(organization_id) or public.is_org_member(organization_id));
drop policy if exists design_categories_write on public.design_categories;
create policy design_categories_write on public.design_categories for all
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists designs_select on public.designs;
create policy designs_select on public.designs for select
  using (
    (status = 'published' and public.is_design_gallery_public(organization_id))
    or public.is_org_member(organization_id)
  );
drop policy if exists designs_write on public.designs;
create policy designs_write on public.designs for all
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- The status check below repeats designs_select on purpose: the subquery is
-- already filtered by designs RLS for anon, but this policy must stay correct
-- if it is ever evaluated by a role that bypasses RLS on designs.
drop policy if exists design_images_select on public.design_images;
create policy design_images_select on public.design_images for select
  using (
    public.is_org_member(organization_id)
    or exists (
      select 1 from public.designs d
      where d.id = design_images.design_id
        and d.status = 'published'
        and public.is_design_gallery_public(d.organization_id)
    )
  );
drop policy if exists design_images_write on public.design_images;
create policy design_images_write on public.design_images for all
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ---------- atomic image ordering ----------
create or replace function public.replace_design_image_order(p_design_id uuid, p_image_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  existing_count integer;
begin
  select count(*) into existing_count from design_images where design_id = p_design_id;
  if existing_count <> coalesce(array_length(p_image_ids, 1), 0)
     or existing_count <> (select count(distinct requested_id) from unnest(p_image_ids) as requested_id)
     or exists (
       select 1 from unnest(p_image_ids) as requested(id)
       where not exists (select 1 from design_images i where i.id = requested.id and i.design_id = p_design_id)
     ) then
    raise exception 'design image order must list every image of the design exactly once';
  end if;

  update design_images i
  set order_index = ordered.position - 1
  from unnest(p_image_ids) with ordinality as ordered(id, position)
  where i.id = ordered.id and i.design_id = p_design_id;
end;
$$;

revoke all on function public.replace_design_image_order(uuid, uuid[]) from public, anon, authenticated;

-- ---------- provisioning ----------
-- Creates the gallery site (disabled) and the default category list for an
-- organization. Used by the Bonyan seed and by the admin panel when another
-- organization turns the gallery on. Never overwrites existing rows.
create or replace function public.provision_design_gallery(
  p_organization_id uuid,
  p_slug text,
  p_display_name_ar text default null,
  p_display_name_en text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into design_gallery_sites (organization_id, slug, display_name_ar, display_name_en)
  values (p_organization_id, p_slug, p_display_name_ar, p_display_name_en)
  on conflict (organization_id) do nothing;

  insert into design_categories (organization_id, key, name_ar, name_en, sort_order, bookable_by_default)
  values
    (p_organization_id, 'villas',                'فلل سكنية',         'Villas',                10, true),
    (p_organization_id, 'residential-complexes', 'مجمعات سكنية',       'Residential complexes', 20, true),
    (p_organization_id, 'commercial',            'تجاري',             'Commercial',            30, true),
    (p_organization_id, 'mixed-use',             'متعدد الاستخدامات',   'Mixed use',             40, true),
    (p_organization_id, 'public-spaces',         'فضاءات عامة',        'Public spaces',         50, false),
    (p_organization_id, 'educational',           'تعليمي',            'Educational',           60, false),
    (p_organization_id, 'mosques',               'مساجد',             'Mosques',               70, false)
  on conflict (organization_id, key) do nothing;
end;
$$;

revoke all on function public.provision_design_gallery(uuid, text, text, text) from public, anon, authenticated;

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'design-gallery',
  'design-gallery',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
