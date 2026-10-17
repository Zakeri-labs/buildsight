-- Migration 077: Project-Scoped Soft Delete for Site Visit Reports
-- Adds deleted_at and deleted_by columns to term_responses.
-- This allows Admins to remove reports from project operational views
-- while strictly preserving subscription accounting, Report Credit ledger records (report_credit_usage),
-- and historical document/PDF download availability.

ALTER TABLE public.term_responses
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS term_responses_project_deleted_idx
  ON public.term_responses(project_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS term_responses_stage_deleted_idx
  ON public.term_responses(project_stage_id, deleted_at)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.term_responses.deleted_at IS
  'Timestamp when this report was soft-deleted/removed from the project operational views. Preserves historical and credit records.';

COMMENT ON COLUMN public.term_responses.deleted_by IS
  'The user ID of the Admin who soft-deleted this report.';
