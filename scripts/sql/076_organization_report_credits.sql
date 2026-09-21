-- Migration 076: Organization Report Credits & Subscriptions System

CREATE TABLE IF NOT EXISTS organization_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  total_report_credits INTEGER NOT NULL DEFAULT 320,
  used_report_credits INTEGER NOT NULL DEFAULT 0,
  start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_subscriptions_organization_id_key UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS report_credit_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES organization_subscriptions(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES term_responses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT report_credit_usage_report_id_key UNIQUE (report_id)
);

-- RLS Policies
ALTER TABLE organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_credit_usage ENABLE ROW LEVEL SECURITY;

-- Allow authenticated organization members to view subscriptions
CREATE POLICY "Users can view subscriptions for their organizations"
  ON organization_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.organization_id = organization_subscriptions.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- Allow authenticated organization members to view credit usage
CREATE POLICY "Users can view credit usage for their organizations"
  ON report_credit_usage
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.organization_id = report_credit_usage.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );
