-- One-off setup for Bonyan's gallery (run AFTER 084_design_meeting_requests.sql).
-- Sets the office address shown to visitors who choose "At the office".
-- Meeting times keep their defaults (Sunday–Thursday 09:00–17:00 Muscat,
-- 45 minutes, 12 hours notice, 3 weeks ahead); change them later from
-- the admin page: Design Gallery → Meeting times.

update public.design_gallery_sites
set office_address_ar = 'المعبيلة الصناعية، مسقط',
    office_address_en = 'Mabela Industrial Area, Muscat'
where slug = 'provision-consultancy';

-- Check: one row with the address and the booking defaults.
select slug, office_address_ar, office_address_en, booking_timezone, booking_work_days,
       booking_day_start, booking_day_end, booking_slot_minutes, booking_min_notice_hours, booking_days_ahead
from public.design_gallery_sites
where slug = 'provision-consultancy';
