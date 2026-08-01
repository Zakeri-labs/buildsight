-- ============================================================
-- Comprehensive, extensible document type values
-- ============================================================

-- Remove the original narrow CHECK constraint. Document types remain validated
-- against the application's central typed configuration, while the text column
-- can accept future stable values without another UI implementation change.
do $$
declare
  constraint_record record;
begin
  if to_regclass('public.documents') is null then
    return;
  end if;

  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.documents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%document_type%'
  loop
    execute format('alter table public.documents drop constraint %I', constraint_record.conname);
  end loop;
end;
$$;

-- Preserve recognised stable values, safely map legacy values, and use "other"
-- as the fallback for existing records whose old free-form value is unknown.
update public.documents
set document_type = case
  when document_type in (
    'ncr',
    'ipc',
    'inspection_report',
    'site_inspection_request',
    'material_inspection_request',
    'wir_ir',
    'request_for_inspection',
    'request_for_information',
    'method_statement',
    'risk_assessment',
    'job_safety_analysis',
    'permit_to_work',
    'toolbox_talk',
    'daily_report',
    'weekly_report',
    'monthly_report',
    'progress_report',
    'incident_report',
    'safety_observation',
    'quality_observation',
    'corrective_action_report',
    'preventive_action_report',
    'punch_list',
    'defect_report',
    'test_report',
    'commissioning_report',
    'handover_document',
    'as_built_document',
    'drawing',
    'shop_drawing',
    'technical_submittal',
    'material_submittal',
    'document_submittal',
    'transmittal',
    'technical_query',
    'change_request',
    'variation_order',
    'site_instruction',
    'work_order',
    'meeting_minutes',
    'checklist',
    'certificate',
    'approval',
    'specification',
    'procedure',
    'policy',
    'manual',
    'schedule',
    'bill_of_quantities',
    'other'
  ) then document_type
  when lower(btrim(document_type)) in ('submittal', 'document submittal') then 'document_submittal'
  when lower(btrim(document_type)) in ('rfi', 'request for information') then 'request_for_information'
  when lower(btrim(document_type)) = 'request for inspection' then 'request_for_inspection'
  when lower(btrim(document_type)) = 'ncr' then 'ncr'
  when lower(btrim(document_type)) = 'drawing' then 'drawing'
  else 'other'
end;

alter table public.documents
  alter column document_type set default 'other',
  alter column document_type set not null;

create index if not exists documents_type_idx on public.documents (document_type);

comment on column public.documents.document_type is
  'Stable machine-readable document type value defined by the application document type registry.';
