-- ============================================================
-- Design gallery demo content for Bonyan. Requires 079_design_gallery.sql.
--
-- Target: the one ACTIVE supervising organization whose name contains
-- "bonyan" (any case) or "بنيان". If none or more than one matches, nothing
-- is written. There is no fallback to another organization.
--
-- Runs only once per organization: if Bonyan already has a gallery (set up
-- earlier by this seed or in the admin panel), nothing is written, so designs
-- or categories an admin deleted or changed never come back.
--
-- Sample images are static files under /public/design-gallery/samples/bonyan.
-- ============================================================

do $$
declare
  org uuid;
  match_count integer;
begin
  select count(*), min(id::text)::uuid into match_count, org
  from public.organizations
  where type = 'supervising'
    and status = 'active'
    and (lower(name) like '%bonyan%' or name like '%بنيان%');

  if match_count <> 1 then
    raise notice 'Design gallery seed skipped: % active supervising organizations match Bonyan (need exactly 1).', match_count;
    return;
  end if;

  if exists (select 1 from public.design_gallery_sites where organization_id = org) then
    raise notice 'Design gallery seed skipped: Bonyan already has a gallery.';
    return;
  end if;

  if exists (select 1 from public.design_gallery_sites where slug = 'bonyan') then
    raise notice 'Design gallery seed skipped: the slug "bonyan" belongs to another organization.';
    return;
  end if;

  perform public.provision_design_gallery(org, 'bonyan', 'بنيان', 'Bonyan');

  update public.design_gallery_sites
  set is_enabled = true, whatsapp_phone = '96894114511'
  where organization_id = org;

  -- Inserted as drafts; published below once each has its image
  -- (a published design must have at least one image).
  insert into public.designs (
    organization_id, category_id, slug, code, title_ar, title_en, summary_ar, summary_en,
    description_ar, description_en, floors_ar, floors_en, built_area_sqm, bedrooms,
    service_ar, service_en, is_bookable, status, sort_order
  )
  select org, c.id, d.slug, d.code, d.title_ar, d.title_en, d.summary_ar, d.summary_en,
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
  join public.design_categories c on c.organization_id = org and c.key = d.category_key;

  insert into public.design_images (organization_id, design_id, storage_path, alt_ar, alt_en, order_index)
  select org, d.id, '/design-gallery/samples/bonyan/' || d.slug || '.webp', d.title_ar, d.title_en, 0
  from public.designs d
  where d.organization_id = org;

  update public.designs set status = 'published', published_at = now()
  where organization_id = org;
end;
$$;
