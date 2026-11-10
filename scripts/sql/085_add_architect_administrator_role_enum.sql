-- ============================================================
-- Migration 085: Add 'architect_administrator' to organization_role enum
--
-- Postgres requires new enum values to be committed outside of a transaction
-- before they can be referenced in column checks, functions, or policies.
-- ============================================================

ALTER TYPE public.organization_role ADD VALUE IF NOT EXISTS 'architect_administrator';
