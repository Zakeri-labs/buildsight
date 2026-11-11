-- ============================================================
-- Migration 088: Allow Public Design Meeting Booking
--
-- Enables public visitors to submit design meeting requests (booking)
-- directly to Supabase via RPC or REST insert.
--
-- 1. Provides public.submit_design_meeting_booking(payload jsonb)
--    with security definer to sanitize inputs, resolve organization,
--    match design by slug, and prevent duplicate submits.
-- 2. Grants anon & authenticated execute on the RPC function.
-- 3. Grants insert on public.design_meeting_requests to anon & authenticated
--    guarded by RLS policy.
-- ============================================================

create or replace function public.submit_design_meeting_booking(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_design_id uuid;
  v_design_code text;
  v_design_title_ar text;
  v_design_title_en text;
  v_path text;
  v_client_name text;
  v_phone text;
  v_email text;
  v_project_type text;
  v_land_status text;
  v_wilayat text;
  v_land_area numeric;
  v_start_timeline text;
  v_idea_text text;
  v_meeting_mode text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_status text;
  v_calendar_status text;
  v_locale text;
  v_request_key uuid;
  v_slot_minutes integer;
  v_existing_id uuid;
  v_new_id uuid;
begin
  -- 1. Extract request key (ensure non-null UUID)
  if payload->>'requestKey' is not null and trim(payload->>'requestKey') <> '' then
    begin
      v_request_key := (payload->>'requestKey')::uuid;
    exception when others then
      v_request_key := gen_random_uuid();
    end;
  else
    v_request_key := gen_random_uuid();
  end if;

  if v_request_key is null then
    v_request_key := gen_random_uuid();
  end if;

  -- 2. Resolve organization_id
  if payload->>'organizationId' is not null then
    begin
      v_org_id := (payload->>'organizationId')::uuid;
    exception when others then
      v_org_id := null;
    end;
  end if;

  if v_org_id is null then
    select s.organization_id into v_org_id
    from public.design_gallery_sites s
    where s.is_enabled = true
    order by s.is_default desc, s.created_at asc
    limit 1;
  end if;

  if v_org_id is null then
    return jsonb_build_object('ok', false, 'error', 'Organization not found');
  end if;

  -- Check if this request_key was already submitted (prevent double-clicks)
  select id into v_existing_id
  from public.design_meeting_requests
  where organization_id = v_org_id and request_key = v_request_key;

  if v_existing_id is not null then
    return jsonb_build_object('ok', true, 'id', v_existing_id, 'duplicate', true);
  end if;

  -- 3. Extract & sanitize client details
  v_client_name := trim(coalesce(payload->>'clientName', ''));
  if length(v_client_name) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Name is too short');
  end if;

  v_phone := regexp_replace(coalesce(payload->>'whatsappPhone', ''), '[^0-9]', '', 'g');
  if length(v_phone) < 8 or length(v_phone) > 15 then
    return jsonb_build_object('ok', false, 'error', 'Invalid phone number');
  end if;

  v_email := nullif(trim(coalesce(payload->>'email', '')), '');
  v_project_type := coalesce(payload->>'projectType', 'villa');
  v_land_status := coalesce(payload->>'landStatus', 'owned_ready');
  v_wilayat := nullif(trim(coalesce(payload->>'wilayat', '')), '');
  
  begin
    v_land_area := nullif(trim(coalesce(payload->>'landAreaSqm', '')), '')::numeric;
  exception when others then
    v_land_area := null;
  end;

  v_start_timeline := coalesce(payload->>'startTimeline', 'within_3_months');
  v_idea_text := nullif(trim(coalesce(payload->>'ideaText', '')), '');
  v_meeting_mode := coalesce(payload->>'meetingMode', 'office');
  v_locale := case when payload->>'locale' in ('ar', 'en') then payload->>'locale' else 'ar' end;
  v_path := case when payload->>'path' in ('same', 'modified', 'idea') then payload->>'path' else 'idea' end;

  -- 4. Look up design if slug is provided
  if payload->>'designSlug' is not null and trim(payload->>'designSlug') <> '' then
    select id, code, title_ar, title_en
    into v_design_id, v_design_code, v_design_title_ar, v_design_title_en
    from public.designs
    where slug = trim(payload->>'designSlug') and organization_id = v_org_id
    limit 1;
    
    if v_design_id is null then
      select id, code, title_ar, title_en
      into v_design_id, v_design_code, v_design_title_ar, v_design_title_en
      from public.designs
      where slug = trim(payload->>'designSlug')
      limit 1;
    end if;
  end if;

  if v_path <> 'idea' and v_design_code is null then
    v_design_code := coalesce(nullif(trim(payload->>'designCode'), ''), 'BD-101');
    v_design_title_ar := coalesce(nullif(trim(payload->>'designTitleAr'), ''), v_design_code);
    v_design_title_en := coalesce(nullif(trim(payload->>'designTitleEn'), ''), v_design_code);
  end if;

  -- 5. Handle meeting mode and slots
  if v_meeting_mode = 'call_me' then
    v_starts_at := null;
    v_ends_at := null;
    v_status := 'new';
    v_calendar_status := 'not_needed';
  else
    begin
      v_starts_at := (payload->>'slotStart')::timestamptz;
    exception when others then
      v_starts_at := null;
    end;

    if v_starts_at is null then
      return jsonb_build_object('ok', false, 'error', 'Slot start is required for scheduled meetings');
    end if;

    begin
      v_ends_at := (payload->>'slotEnd')::timestamptz;
    exception when others then
      v_ends_at := null;
    end;

    if v_ends_at is null or v_ends_at <= v_starts_at then
      select coalesce(s.booking_slot_minutes, 45) into v_slot_minutes
      from public.design_gallery_sites s
      where s.organization_id = v_org_id
      limit 1;

      v_ends_at := v_starts_at + ((coalesce(v_slot_minutes, 45)::text || ' minutes')::interval);
    end if;

    v_status := 'confirmed';
    v_calendar_status := 'pending';
  end if;

  if v_meeting_mode = 'remote' and v_email is null then
    return jsonb_build_object('ok', false, 'error', 'Email is required for remote video meetings');
  end if;

  -- 6. Insert into design_meeting_requests
  insert into public.design_meeting_requests (
    organization_id,
    design_id,
    design_code,
    design_title_ar,
    design_title_en,
    request_key,
    path,
    client_name,
    whatsapp_phone,
    email,
    project_type,
    land_status,
    wilayat,
    land_area_sqm,
    start_timeline,
    idea_text,
    meeting_mode,
    starts_at,
    ends_at,
    status,
    calendar_status,
    locale,
    referrer_host,
    utm_source,
    utm_medium,
    utm_campaign
  ) values (
    v_org_id,
    v_design_id,
    v_design_code,
    v_design_title_ar,
    v_design_title_en,
    v_request_key,
    v_path,
    v_client_name,
    v_phone,
    v_email,
    v_project_type,
    v_land_status,
    v_wilayat,
    v_land_area,
    v_start_timeline,
    v_idea_text,
    v_meeting_mode,
    v_starts_at,
    v_ends_at,
    v_status,
    v_calendar_status,
    v_locale,
    payload->>'referrerHost',
    payload->>'utmSource',
    payload->>'utmMedium',
    payload->>'utmCampaign'
  ) returning id into v_new_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_new_id,
    'status', v_status,
    'startsAt', v_starts_at,
    'endsAt', v_ends_at
  );
exception when others then
  return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

grant execute on function public.submit_design_meeting_booking(jsonb) to anon, authenticated;
grant insert on public.design_meeting_requests to anon, authenticated;

drop policy if exists design_meeting_requests_public_insert on public.design_meeting_requests;
create policy design_meeting_requests_public_insert on public.design_meeting_requests
  for insert to anon, authenticated
  with check (
    status in ('new', 'confirmed')
    and exists (
      select 1 from public.design_gallery_sites s
      where s.organization_id = design_meeting_requests.organization_id
        and s.is_enabled = true
    )
  );
