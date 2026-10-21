-- ============================================================
-- Design gallery: the first gallery becomes the default, and demo designs
-- can be added to any organization's gallery.
--
-- 1. provision_design_gallery (used by "Set up the gallery" in the admin
--    panel) now marks the new gallery as the default when no gallery is the
--    default yet, so /designs works without extra configuration.
-- 2. If no gallery is the default and there is exactly one gallery, it
--    becomes the default (repairs galleries set up before this change).
-- 3. add_design_gallery_samples(organization_id) adds the 8 demo designs
--    with their bundled images, published, only if the organization has no
--    designs yet. Returns how many designs were added.
-- Requires 079 and 082.
-- ============================================================

create or replace function public.provision_design_gallery(
  p_organization_id uuid,
  p_slug text,
  p_display_name_ar text default null,
  p_display_name_en text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into design_gallery_sites (organization_id, slug, display_name_ar, display_name_en, is_default)
  values (
    p_organization_id, p_slug, p_display_name_ar, p_display_name_en,
    not exists (select 1 from design_gallery_sites where is_default)
  )
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

update public.design_gallery_sites
set is_default = true
where not exists (select 1 from public.design_gallery_sites where is_default)
  and (select count(*) from public.design_gallery_sites) = 1;

create or replace function public.add_design_gallery_samples(p_organization_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  added integer;
begin
  if not exists (select 1 from design_gallery_sites where organization_id = p_organization_id) then
    raise exception 'organization has no design gallery; set it up first';
  end if;
  if exists (select 1 from designs where organization_id = p_organization_id) then
    return 0;
  end if;

  -- Inserted as drafts; published below once each has its image
  -- (a published design must have at least one image).
  insert into public.designs (
    organization_id, category_id, slug, code, title_ar, title_en, summary_ar, summary_en,
    description_ar, description_en, floors_ar, floors_en, built_area_sqm, bedrooms,
    service_ar, service_en, is_bookable, status, sort_order
  )
  select p_organization_id, c.id, d.slug, d.code, d.title_ar, d.title_en, d.summary_ar, d.summary_en,
         d.description_ar, d.description_en, d.floors_ar, d.floors_en, d.area, d.bedrooms,
         d.service_ar, d.service_en, d.bookable, 'draft', d.sort_order
  from (values
    ('villas', 'modern-villa-pool', 'BD-101', 'فيلا عصرية بمسبح', 'Modern villa with pool',
     'طابقان + سطح · مسبح', 'Two floors + roof · Pool',
     'واجهات بيضاء بلمسات خشبية ومسبح خارجي. يُعدَّل التصميم حسب أرضك وميزانيتك واشتراطات البلدية.',
     'White facades with timber accents and an outdoor pool. The design is adapted to your plot, budget and municipality requirements.',
     'سطح + 2', 'Roof + 2', 520::numeric, 5, 'تصميم + 3D', 'Design + 3D', true, 10),
    ('villas', 'simple-lines-villa', 'BD-102', 'فيلا بخطوط بسيطة', 'Clean-lines villa',
     'طابقان · واجهة بيضاء', 'Two floors · White facade',
     'كتل بسيطة وواجهة هادئة بلمسات حجرية، مناسبة للأراضي المتوسطة.',
     'Simple massing and a calm facade with stone accents, suited to mid-size plots.',
     'أرضي + أول', 'Ground + first', 380::numeric, 4, 'تصميم + 3D', 'Design + 3D', true, 20),
    ('villas', 'stone-facade-villa', 'BD-103', 'فيلا بواجهة حجرية', 'Stone-facade villa',
     'طابق واحد · إطلالة جبلية', 'Single storey · Mountain view',
     'واجهة حجرية بإضاءة دافئة وإطلالة مفتوحة على الجبل.',
     'A stone facade with warm lighting and an open view of the mountains.',
     'أرضي', 'Ground', 450::numeric, 4, 'تصميم + 3D', 'Design + 3D', true, 30),
    ('residential-complexes', 'attached-villas-complex', 'BD-201', 'مجمع فلل متلاصقة', 'Attached villas complex',
     'وحدات متكررة · مواقف خاصة', 'Repeated units · Private parking',
     'فلل متلاصقة بواجهات منحنية ومشربيات، لكل وحدة موقف خاص وسطح.',
     'Attached villas with curved facades and mashrabiya screens; every unit has private parking and a roof terrace.',
     'سطح + 2', 'Roof + 2', 310::numeric, 4, 'تصميم + 3D', 'Design + 3D', true, 40),
    ('mixed-use', 'mixed-use-complex', 'BD-301', 'مجمع متعدد الاستخدامات', 'Mixed-use complex',
     'سكني وتجاري · واجهة خضراء', 'Residential and retail · Green facade',
     'برج منحني بشرفات مزروعة، يجمع المحلات التجارية والوحدات السكنية.',
     'A curved tower with planted balconies combining retail and residential units.',
     '9 طوابق', '9 floors', 12000::numeric, null::integer, 'تصميم + 3D', 'Design + 3D', true, 50),
    ('educational', 'university-office-building', 'BD-401', 'مبنى مكاتب جامعي', 'University office building',
     'مشروع مرجعي', 'Reference project',
     'مبنى إداري جامعي بواجهة مشربية وساحة مائية.',
     'A university administration building with a mashrabiya facade and a water court.',
     'أرضي + 2', 'Ground + 2', 5000::numeric, null::integer, 'تصميم + 3D', 'Design + 3D', false, 60),
    ('public-spaces', 'al-murtafa-beach-sur', 'BD-501', 'تطوير شاطئ المرتفع، ولاية صور', 'Al Murtafa beach development, Sur',
     'مشروع حكومي مرجعي', 'Government reference project',
     'ممشى بحري ومسارات للدراجات ومرافق عامة على الواجهة البحرية.',
     'A seafront promenade with cycling paths and public facilities.',
     null, null, null::numeric, null::integer, 'تصميم + 3D', 'Design + 3D', false, 70),
    ('public-spaces', 'saham-public-park', 'BD-502', 'حديقة صحم العامة', 'Saham public park',
     'مشروع حكومي مرجعي', 'Government reference project',
     'حديقة عامة بمسارات مشي وملاعب ومناطق ألعاب للأطفال.',
     'A public park with walking paths, sports courts and children''s play areas.',
     null, null, null::numeric, null::integer, 'تصميم + 3D', 'Design + 3D', false, 80)
  ) as d(category_key, slug, code, title_ar, title_en, summary_ar, summary_en, description_ar, description_en,
         floors_ar, floors_en, area, bedrooms, service_ar, service_en, bookable, sort_order)
  join public.design_categories c on c.organization_id = p_organization_id and c.key = d.category_key;

  insert into public.design_images (organization_id, design_id, storage_path, alt_ar, alt_en, order_index)
  select p_organization_id, d.id, '/design-gallery/samples/bonyan/' || d.slug || '.webp', d.title_ar, d.title_en, 0
  from public.designs d
  where d.organization_id = p_organization_id;


  update public.designs set status = 'published', published_at = now()
  where organization_id = p_organization_id;

  get diagnostics added = row_count;
  return added;
end;
$$;

revoke all on function public.add_design_gallery_samples(uuid) from public, anon, authenticated;
