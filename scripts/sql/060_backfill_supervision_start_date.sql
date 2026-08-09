-- Phase 1 Visit Compliance legacy baseline backfill.
-- Existing real supervision_start_date values are preserved. Legacy nulls are
-- filled once from start_date, otherwise from the migration execution date in
-- the application's canonical Gulf timezone.
UPDATE public.projects
SET supervision_start_date = COALESCE(
  start_date,
  (timezone('Asia/Dubai', now()))::date
)
WHERE supervision_start_date IS NULL;
