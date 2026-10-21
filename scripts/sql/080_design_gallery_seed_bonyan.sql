-- ============================================================
-- Design gallery demo content for Bonyan.
--
-- Targets the supervising organization whose name contains "bonyan"
-- (case-insensitive); falls back to the oldest supervising organization.
-- Safe to run more than once: rows are inserted with ON CONFLICT DO NOTHING,
-- so edits made later in the admin panel are never overwritten.
-- Sample images are static files under /public/design-gallery/samples/bonyan
-- (paths that start with "/" are served as-is by the app).
-- Requires 079_design_gallery.sql (provision_design_gallery).
-- ============================================================

do $$
declare
  org uuid;
begin
  select id into org
  from public.organizations
  where type = 'supervising'
  order by (lower(name) like '%bonyan%') desc, created_at asc
  limit 1;

  if org is null then
    raise notice 'No supervising organization found; design gallery seed skipped.';
    return;
  end if;

  perform public.provision_design_gallery(org, 'bonyan', 'بنيان', 'Bonyan');

  -- Turn the demo on only the first time; later admin changes are kept.
  update public.design_gallery_sites
  set is_enabled = true, whatsapp_phone = '96894114511'
  where organization_id = org and whatsapp_phone is null and not is_enabled
    and not exists (select 1 from public.designs where organization_id = org);

  insert into public.designs (
    organization_id, category_id, slug, code, title_ar, title_en, summary_ar, summary_en,
    description_ar, description_en, floors_ar, floors_en, built_area_sqm, bedrooms,
    service_ar, service_en, is_bookable, status, sort_order, published_at
  )
  select org, c.id, d.slug, d.code, d.title_ar, d.title_en, d.summary_ar, d.summary_en,
         d.description_ar, d.description_en, d.floors_ar, d.floors_en, d.area, d.bedrooms,
         d.service_ar, d.service_en, d.bookable, 'published', d.sort_order, now()
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
  join public.design_categories c on c.organization_id = org and c.key = d.category_key
  on conflict (organization_id, slug) do nothing;

  insert into public.design_images (organization_id, design_id, storage_path, alt_ar, alt_en, order_index)
  select org, d.id, '/design-gallery/samples/bonyan/' || d.slug || '.webp', d.title_ar, d.title_en, 0
  from public.designs d
  where d.organization_id = org
    and d.slug in (
      'modern-villa-pool', 'simple-lines-villa', 'stone-facade-villa', 'attached-villas-complex',
      'mixed-use-complex', 'university-office-building', 'al-murtafa-beach-sur', 'saham-public-park'
    )
    and not exists (select 1 from public.design_images i where i.design_id = d.id);
end;
$$;
