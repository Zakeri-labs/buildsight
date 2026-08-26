-- Create a high-performance PostgreSQL RPC function to calculate checklist item totals
-- and passed item counts per project stage for a given list of project IDs.
-- This replaces transferring full term_responses.response_content JSON payloads over PostgREST.

create or replace function public.get_project_stage_checklist_counts(
  target_project_ids uuid[]
)
returns table (
  project_stage_id uuid,
  report_checklist_total bigint,
  stage_checked bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if target_project_ids is null or array_length(target_project_ids, 1) is null then
    return;
  end if;

  return query
  with raw_responses as (
    select
      tr.project_stage_id,
      case
        when jsonb_typeof(tr.response_content->'checklist') = 'array'
          then tr.response_content->'checklist'
        when jsonb_typeof(tr.response_content->'checklist') = 'string' then
          case
            when (tr.response_content->>'checklist') ~ '^\s*\[' then
              (tr.response_content->>'checklist')::jsonb
            else null
          end
        else null
      end as arr
    from public.term_responses tr
    where tr.project_id = any(target_project_ids)
      and tr.project_stage_id is not null
      and tr.response_content is not null
  ),
  expanded as (
    select
      r.project_stage_id,
      elem
    from raw_responses r,
    jsonb_array_elements(r.arr) as elem
    where r.arr is not null
  )
  select
    e.project_stage_id,
    count(*)::bigint as report_checklist_total,
    count(*) filter (
      where (elem->>'checked') = 'true'
         or elem->>'result' = 'pass'
    )::bigint as stage_checked
  from expanded e
  group by e.project_stage_id;
end;
$$;

revoke all on function public.get_project_stage_checklist_counts(uuid[]) from public;
grant execute on function public.get_project_stage_checklist_counts(uuid[]) to service_role;
