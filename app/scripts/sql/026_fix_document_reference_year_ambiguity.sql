-- ============================================================
-- Fix construction document reference generation ambiguity.
-- Replaces the trigger function only; no table or column changes.
-- ============================================================

create or replace function public.set_document_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_reference_prefix text;
  generated_reference_year integer;
  generated_reference_number integer;
begin
  if new.reference is null or btrim(new.reference) = '' then
    generated_reference_prefix := public.document_reference_prefix(new.document_type);
    generated_reference_year := extract(year from coalesce(new.created_at, now()))::integer;

    insert into public.document_reference_counters as counters (document_type, reference_year, last_value)
    values (generated_reference_prefix, generated_reference_year, 1)
    on conflict on constraint document_reference_counters_pkey
    do update set last_value = counters.last_value + 1
    returning counters.last_value into generated_reference_number;

    new.reference := generated_reference_prefix || '-' || generated_reference_year::text || '-' || lpad(generated_reference_number::text, 3, '0');
  end if;

  new.updated_at := now();
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  elsif new.status = 'draft' then
    new.published_at := null;
  end if;
  return new;
end;
$$;
