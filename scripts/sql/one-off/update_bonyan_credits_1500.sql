-- One-off script for Bonyan (Provision Consultancy).
-- Increases total report credits from 600 to 1500.
-- Organization ID: 92cdf1aa-95d2-43ea-a660-820c2449c5cf
-- Subscription ID: 63a88ba6-c9b6-4113-ad82-81776c8bba8d

UPDATE public.organization_subscriptions
SET total_report_credits = 1500,
    updated_at = NOW()
WHERE organization_id = '92cdf1aa-95d2-43ea-a660-820c2449c5cf';

-- Verification query:
SELECT id, organization_id, total_report_credits, used_report_credits,
       (total_report_credits - used_report_credits) AS remaining_credits,
       start_at, updated_at
FROM public.organization_subscriptions
WHERE organization_id = '92cdf1aa-95d2-43ea-a660-820c2449c5cf';
