-- ============================================================
-- Design gallery (معرض التصاميم) — multi-organization catalogue
--
-- Each organization can run its own public gallery:
--   design_gallery_sites  one row per organization (public slug, optional custom host)
--   design_categories     the organization's own category list
--   designs               the designs, bilingual, draft/published/archived
--   design_images         ordered images per design; the first image is the cover
--
-- Public (anon) reads are limited to published designs of an enabled gallery
-- of an active organization; org admins read everything of their organization.
-- Nobody writes through the API: all changes go through server actions that
-- check org_admin and use the service role. Image files live in the public
-- `design-gallery` bucket under `{organization_id}/{design_id}/{uuid}.{ext}`;
-- uploads are signed by the server, so storage.objects needs no client policy.
-- Files stay reachable by URL until removed, even if a design is unpublished.
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

-- ---------- integrity ----------
-- Image paths are either a bundled sample under /public or an upload inside
-- this exact organization/design folder of the design-gallery bucket.
alter table public.design_images drop constraint if exists design_images_storage_path_format;
alter table public.design_images add constraint design_images_storage_path_format check (
  storage_path ~ '^/design-gallery/samples/[a-z0-9-]+/[a-z0-9-]+\.(jpg|png|webp)$'
  or storage_path ~ ('^' || organization_id::text || '/' || design_id::text
                     || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
);

-- A published design always has at least one image. Both checks lock the
-- design row, so a publish and an image delete running at the same time are
-- serialized and cannot leave a published design without images.
create or replace function public.design_publish_requires_image()
returns trigger language plpgsql as $$
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and not exists (select 1 from public.design_images where design_id = new.id) then
    raise exception 'design_needs_image: a published design needs at least one image'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists designs_publish_requires_image on public.designs;
create trigger designs_publish_requires_image before insert or update of status on public.designs
  for each row execute function public.design_publish_requires_image();

create or replace function public.design_keep_last_published_image()
returns trigger language plpgsql as $$
declare
  parent_status text;
begin
  select status into parent_status from public.designs where id = old.design_id for update;
  -- The parent is gone when the whole design is being deleted (cascade).
  if parent_status = 'published'
     and not exists (select 1 from public.design_images where design_id = old.design_id) then
    raise exception 'design_needs_image: the last image of a published design cannot be removed'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists design_images_keep_last_published on public.design_images;
create trigger design_images_keep_last_published after delete on public.design_images
  for each row execute function public.design_keep_last_published_image();

-- ---------- visibility helper ----------
create or replace function public.is_design_gallery_public(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from design_gallery_sites s
    join organizations o on o.id = s.organization_id
    where s.organization_id = org and s.is_enabled and o.status = 'active'
  );
$$;

-- ---------- RLS ----------
-- Reads: the public sees published designs of an enabled gallery of an active
-- organization; org admins see everything of their organization.
-- Writes: none through the API. Every change goes through the server actions
-- in lib/design-gallery/actions.ts, which check org_admin and use the service
-- role, so slug, custom host and the business rules cannot be bypassed.
alter table public.design_gallery_sites enable row level security;
alter table public.design_categories enable row level security;
alter table public.designs enable row level security;
alter table public.design_images enable row level security;

drop policy if exists design_gallery_sites_write on public.design_gallery_sites;
drop policy if exists design_categories_write on public.design_categories;
drop policy if exists designs_write on public.designs;
drop policy if exists design_images_write on public.design_images;
revoke insert, update, delete on public.design_gallery_sites, public.design_categories, public.designs, public.design_images
  from anon, authenticated;

drop policy if exists design_gallery_sites_select on public.design_gallery_sites;
create policy design_gallery_sites_select on public.design_gallery_sites for select
  using (public.is_design_gallery_public(organization_id) or public.is_org_admin(organization_id));

drop policy if exists design_categories_select on public.design_categories;
create policy design_categories_select on public.design_categories for select
  using (public.is_design_gallery_public(organization_id) or public.is_org_admin(organization_id));

drop policy if exists designs_select on public.designs;
create policy designs_select on public.designs for select
  using (
    (status = 'published' and public.is_design_gallery_public(organization_id))
    or public.is_org_admin(organization_id)
  );

-- The status check repeats designs_select on purpose: the subquery is already
-- filtered by designs RLS for anon, but this policy must stay correct if it is
-- ever evaluated by a role that bypasses RLS on designs.
drop policy if exists design_images_select on public.design_images;
create policy design_images_select on public.design_images for select
  using (
    public.is_org_admin(organization_id)
    or exists (
      select 1 from public.designs d
      where d.id = design_images.design_id
        and d.status = 'published'
        and public.is_design_gallery_public(d.organization_id)
    )
  );

-- ---------- adding an image ----------
-- Appends at the end of the design's images. Locks the design row so two
-- uploads finishing together get distinct positions. Returns the image id;
-- a repeated call with the same path returns the existing image.
create or replace function public.append_design_image(p_organization_id uuid, p_design_id uuid, p_storage_path text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing uuid;
  next_index integer;
  created uuid;
begin
  perform 1 from designs where id = p_design_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'design not found';
  end if;

  select id into existing from design_images where storage_path = p_storage_path and design_id = p_design_id;
  if existing is not null then
    return existing;
  end if;

  select coalesce(max(order_index) + 1, 0) into next_index from design_images where design_id = p_design_id;
  insert into design_images (organization_id, design_id, storage_path, order_index)
  values (p_organization_id, p_design_id, p_storage_path, next_index)
  returning id into created;
  return created;
end;
$$;

revoke all on function public.append_design_image(uuid, uuid, text) from public, anon, authenticated;

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
