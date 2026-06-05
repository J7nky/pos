-- ---------------------------------------------------------------------------
-- Drop legacy bill_audit_logs table
-- ---------------------------------------------------------------------------
-- The bill-specific audit trail is superseded by the general-purpose
-- `audit_logs` service: bills (create/update/void/reactivate) and sale
-- line-item edits are now audited semantically at the operation layer, so the
-- old one-row-per-field `bill_audit_logs` table is redundant.
--
-- Safe to run repeatedly. No production data depends on it
-- (see project: no production data yet).

drop table if exists public.bill_audit_logs cascade;
