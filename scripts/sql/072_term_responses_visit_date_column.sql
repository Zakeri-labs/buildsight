-- Add editable visit_date column to public.term_responses
alter table public.term_responses
add column if not exists visit_date date;
