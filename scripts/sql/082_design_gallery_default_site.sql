-- ============================================================
-- Design gallery: the default gallery is stored in the database.
--
-- A request whose host is not any gallery's custom host (for example
-- app.bonyanec.com or a Vercel preview URL) shows the gallery marked
-- is_default. At most one gallery can be the default. The environment
-- variable DESIGN_GALLERY_DEFAULT_SITE, if set, still takes precedence.
-- Requires 079_design_gallery.sql.
-- ============================================================

alter table public.design_gallery_sites
  add column if not exists is_default boolean not null default false;

create unique index if not exists design_gallery_sites_one_default
  on public.design_gallery_sites (is_default)
  where is_default;

-- Bonyan is the default gallery, unless another gallery already is.
update public.design_gallery_sites
set is_default = true
where slug = 'bonyan'
  and not exists (select 1 from public.design_gallery_sites where is_default);
