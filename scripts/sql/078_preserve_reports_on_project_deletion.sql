-- Migration 078: Preserve Reports When an Entire Project Is Deleted
-- 1. Adds deleted_at and deleted_by columns to public.projects.
-- 2. Adds partial index on public.projects for active projects.
-- 3. Changes foreign key constraint on term_responses(project_id) from ON DELETE CASCADE to ON DELETE RESTRICT
--    to guarantee at the database level that no cascade can permanently destroy report records.
-- 4. Changes foreign key constraint on report_credit_usage(report_id) from ON DELETE CASCADE to ON DELETE RESTRICT
--    to guarantee at the database level that no cascade can permanently destroy credit ledger records.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_supervising_org_deleted_idx
  ON public.projects(supervising_organization_id, deleted_at)
  WHERE deleted_at IS NULL;

-- Guard term_responses against cascading project deletion
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'term_responses_project_id_fkey'
      AND table_name = 'term_responses'
  ) THEN
    ALTER TABLE public.term_responses
      DROP CONSTRAINT term_responses_project_id_fkey;
  END IF;

  ALTER TABLE public.term_responses
    ADD CONSTRAINT term_responses_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;
END $$;

-- Guard report_credit_usage against cascading report deletion
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'report_credit_usage_report_id_fkey'
      AND table_name = 'report_credit_usage'
  ) THEN
    ALTER TABLE public.report_credit_usage
      DROP CONSTRAINT report_credit_usage_report_id_fkey;
  END IF;

  ALTER TABLE public.report_credit_usage
    ADD CONSTRAINT report_credit_usage_report_id_fkey
    FOREIGN KEY (report_id) REFERENCES public.term_responses(id) ON DELETE RESTRICT;
END $$;

-- Allow soft-delete operations through status validation trigger
CREATE OR REPLACE FUNCTION public.validate_term_response_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN new;
  END IF;

  -- Allow soft-delete operations
  IF old.deleted_at IS DISTINCT FROM new.deleted_at THEN
    RETURN new;
  END IF;

  IF old.status IN ('approved', 'completed') THEN
    RAISE EXCEPTION 'Completed stage reports are locked';
  END IF;

  IF old.status IN ('submitted', 'under_review') THEN
    IF old.status IS NOT DISTINCT FROM new.status THEN
      RAISE EXCEPTION 'Reports under review are locked';
    END IF;
    IF NOT public.is_project_stage_reviewer(new.project_id) THEN
      RAISE EXCEPTION 'Only authorized reviewers can change a report under review';
    END IF;
    IF old.status = 'submitted' AND new.status NOT IN ('under_review', 'approved', 'rejected') THEN
      RAISE EXCEPTION 'Invalid submitted report status transition';
    END IF;
    IF old.status = 'under_review' AND new.status NOT IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'Invalid review status transition';
    END IF;
  ELSIF old.status IS DISTINCT FROM new.status
        AND new.status IN ('approved', 'rejected', 'under_review')
        AND NOT public.is_project_stage_reviewer(new.project_id) THEN
    RAISE EXCEPTION 'Only authorized reviewers can review stage reports';
  END IF;

  RETURN new;
END;
$$;

COMMENT ON COLUMN public.projects.deleted_at IS
  'Timestamp when the project was soft-deleted. Associated reports and credit usage records are preserved.';

COMMENT ON COLUMN public.projects.deleted_by IS
  'The user ID of the Administrator who soft-deleted this project.';
