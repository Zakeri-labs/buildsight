-- ============================================================
-- Migration 086: Architect Administrator access and lightweight restrictions
--
-- 1. Helper function is_design_gallery_admin(org)
-- 2. Grant Design Gallery read/manage access to architect_administrator
-- 3. Restrict sensitive organization-level tables (subscriptions, credits, audit logs, stage templates)
-- ============================================================

-- 1. Helper function for Design Gallery administrative access
CREATE OR REPLACE FUNCTION public.is_design_gallery_admin(org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = org
      AND user_id = auth.uid()
      AND role IN ('org_admin', 'architect_administrator')
      AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_design_gallery_admin(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_design_gallery_admin(uuid) TO authenticated, service_role;

-- 2. Design Gallery RLS policies (allow org_admin and architect_administrator)
DROP POLICY IF EXISTS design_gallery_sites_select ON public.design_gallery_sites;
CREATE POLICY design_gallery_sites_select ON public.design_gallery_sites FOR SELECT
  USING (public.is_design_gallery_public(organization_id) OR public.is_design_gallery_admin(organization_id));

DROP POLICY IF EXISTS design_categories_select ON public.design_categories;
CREATE POLICY design_categories_select ON public.design_categories FOR SELECT
  USING (public.is_design_gallery_public(organization_id) OR public.is_design_gallery_admin(organization_id));

DROP POLICY IF EXISTS designs_select ON public.designs;
CREATE POLICY designs_select ON public.designs FOR SELECT
  USING (
    (status = 'published' AND public.is_design_gallery_public(organization_id))
    OR public.is_design_gallery_admin(organization_id)
  );

DROP POLICY IF EXISTS design_images_select ON public.design_images;
CREATE POLICY design_images_select ON public.design_images FOR SELECT
  USING (
    public.is_design_gallery_admin(organization_id)
    OR EXISTS (
      SELECT 1 FROM public.designs d
      WHERE d.id = design_images.design_id
        AND d.status = 'published'
        AND public.is_design_gallery_public(d.organization_id)
    )
  );

DROP POLICY IF EXISTS design_meeting_requests_select ON public.design_meeting_requests;
CREATE POLICY design_meeting_requests_select ON public.design_meeting_requests FOR SELECT
  USING (public.is_design_gallery_admin(organization_id));

DROP POLICY IF EXISTS design_meeting_attachments_select ON public.design_meeting_attachments;
CREATE POLICY design_meeting_attachments_select ON public.design_meeting_attachments FOR SELECT
  USING (public.is_design_gallery_admin(organization_id));

-- 3. Organization subscriptions restriction: architect_administrator cannot read subscription data
DROP POLICY IF EXISTS "Users can view subscriptions for their organizations" ON public.organization_subscriptions;
CREATE POLICY "Users can view subscriptions for their organizations"
  ON public.organization_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.organization_id = organization_subscriptions.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role != 'architect_administrator'
    )
  );

-- 4. Report credit usage restriction: architect_administrator cannot read credit usage
DROP POLICY IF EXISTS "Users can view credit usage for their organizations" ON public.report_credit_usage;
CREATE POLICY "Users can view credit usage for their organizations"
  ON public.report_credit_usage
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.organization_id = report_credit_usage.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role != 'architect_administrator'
    )
  );

-- 5. Audit logs restriction: architect_administrator cannot view organization audit logs
DROP POLICY IF EXISTS audit_select ON public.audit_logs;
CREATE POLICY audit_select ON public.audit_logs FOR SELECT
  USING (
    actor_id = auth.uid()
    OR (
      project_id IS NOT NULL
      AND (
        public.is_project_owner_viewer(project_id)
        OR public.is_project_member(project_id)
        OR public.is_supervising_org_admin(project_id)
      )
    )
    OR (
      project_id IS NULL
      AND organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.organization_memberships om
        WHERE om.organization_id = audit_logs.organization_id
          AND om.user_id = auth.uid()
          AND om.status = 'active'
          AND om.role = 'architect_administrator'
      )
    )
  );

-- 6. Stage templates restriction: architect_administrator cannot manage templates or create stages
CREATE OR REPLACE FUNCTION public.can_manage_stage_templates(org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.organization_memberships restricted_membership
      WHERE restricted_membership.organization_id = org
        AND restricted_membership.user_id = auth.uid()
        AND restricted_membership.status = 'active'
        AND restricted_membership.role IN ('org_member', 'viewer', 'architect_administrator')
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.organization_memberships membership
        WHERE membership.organization_id = org
          AND membership.user_id = auth.uid()
          AND membership.status = 'active'
          AND membership.role IN ('org_admin', 'org_manager')
      )
      OR EXISTS (
        SELECT 1
        FROM public.project_user_memberships membership
        JOIN public.projects project ON project.id = membership.project_id
        WHERE project.supervising_organization_id = org
          AND membership.user_id = auth.uid()
          AND membership.status = 'active'
          AND membership.access_role IN ('project_admin', 'project_manager')
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_create_project_stage(proj uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.projects project
      WHERE project.id = proj
        AND NOT EXISTS (
          SELECT 1
          FROM public.organization_memberships restricted_membership
          WHERE restricted_membership.organization_id = project.supervising_organization_id
            AND restricted_membership.user_id = auth.uid()
            AND restricted_membership.status = 'active'
            AND restricted_membership.role IN ('org_member', 'viewer', 'architect_administrator')
        )
    )
    AND public.is_project_admin(proj);
$$;

DROP POLICY IF EXISTS stages_select ON public.stages;
CREATE POLICY stages_select ON public.stages FOR SELECT
  USING (
    (
      public.is_org_member(organization_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.organization_memberships om
        WHERE om.organization_id = stages.organization_id
          AND om.user_id = auth.uid()
          AND om.status = 'active'
          AND om.role = 'architect_administrator'
      )
    )
    OR public.can_manage_stage_templates(organization_id)
  );

DROP POLICY IF EXISTS stage_terms_select ON public.stage_terms;
CREATE POLICY stage_terms_select ON public.stage_terms FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.stages stage
      WHERE stage.id = stage_terms.stage_id
        AND (
          (
            public.is_org_member(stage.organization_id)
            AND NOT EXISTS (
              SELECT 1 FROM public.organization_memberships om
              WHERE om.organization_id = stage.organization_id
                AND om.user_id = auth.uid()
                AND om.status = 'active'
                AND om.role = 'architect_administrator'
            )
          )
          OR public.can_manage_stage_templates(stage.organization_id)
        )
    )
  );
