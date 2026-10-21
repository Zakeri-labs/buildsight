-- One-off setup for the live gallery (slug: provision-consultancy).
-- Run AFTER 083_design_gallery_first_default_and_samples.sql.
-- Safe to run again: the demo designs are added only if the gallery has none.

update public.design_gallery_sites
set is_enabled      = true,
    display_name_ar = 'بنيان',
    display_name_en = 'Bonyan',
    whatsapp_phone  = coalesce(whatsapp_phone, '96894114511'),
    logo_url        = coalesce(logo_url, '/Logow.png'),
    website_url     = coalesce(website_url, 'https://bonyanec.com')
where slug = 'provision-consultancy';

select add_design_gallery_samples(organization_id) as designs_added
from public.design_gallery_sites
where slug = 'provision-consultancy';

-- Check: one row, enabled, default, 8 published designs.
select slug, is_enabled, is_default,
       (select count(*) from public.designs d
        where d.organization_id = s.organization_id and d.status = 'published') as published
from public.design_gallery_sites s;
