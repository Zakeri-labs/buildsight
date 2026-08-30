-- Add recipient_group column to report_cc_recipients table
-- Allows distinguishing 'reportTo' (Report To) vs 'ccTo' (CC) recipients explicitly.
-- Nullable to preserve legacy row fallback semantics without backfilling ambiguous historical data.

ALTER TABLE public.report_cc_recipients
ADD COLUMN IF NOT EXISTS recipient_group text CHECK (recipient_group IN ('reportTo', 'ccTo'));

COMMENT ON COLUMN public.report_cc_recipients.recipient_group IS 'Explicit recipient role group: reportTo or ccTo. Null for legacy records.';
