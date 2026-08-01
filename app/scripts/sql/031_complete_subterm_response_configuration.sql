-- Complete the existing one-level Sub-term configuration without replacing its workflow.

alter table public.project_stage_terms
  add column if not exists response_type text,
  add column if not exists instructions text;

alter table public.project_stage_terms
  alter column response_type set default 'combined';

update public.project_stage_terms
set response_type = 'combined'
where response_type is null
   or response_type not in (
     'combined',
     'text',
     'inspection_checklist',
     'yes_no',
     'pass_fail',
     'measurement',
     'date',
     'file_upload',
     'photo_evidence'
   );

alter table public.project_stage_terms
  alter column response_type set not null;

alter table public.project_stage_terms
  drop constraint if exists project_stage_terms_response_type_check;
alter table public.project_stage_terms
  add constraint project_stage_terms_response_type_check check (
    response_type in (
      'combined',
      'text',
      'inspection_checklist',
      'yes_no',
      'pass_fail',
      'measurement',
      'date',
      'file_upload',
      'photo_evidence'
    )
  );

alter table public.project_stage_terms
  drop constraint if exists project_stage_terms_instructions_length_check;
alter table public.project_stage_terms
  add constraint project_stage_terms_instructions_length_check check (
    instructions is null or char_length(instructions) <= 5000
  );

comment on column public.project_stage_terms.response_type is
  'Response UI configuration for a Term or one-level Sub-term. Existing Terms default to combined.';
comment on column public.project_stage_terms.instructions is
  'Optional instructions displayed to the responding project user.';
