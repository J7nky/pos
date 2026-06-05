-- ---------------------------------------------------------------------------
-- Audit logs — retention prune (decision 4: 4 months, hard delete, no archive)
-- ---------------------------------------------------------------------------
-- Schedules a nightly service-role DELETE of audit_logs older than 4 months.
-- Requires the pg_cron extension (Supabase: Database → Extensions → enable
-- "pg_cron"). This migration is SAFE to run with or without pg_cron: if the
-- extension is absent it logs a notice and does nothing, so it can be re-run
-- after enabling pg_cron. Re-running with pg_cron present re-points the job.
--
-- The client also performs an opportunistic local prune on startup
-- (auditService.pruneLocal) so offline devices stay bounded; this job is the
-- authoritative server-side enforcement.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Drop any prior schedule with this name so the migration is idempotent.
    perform cron.unschedule('audit_logs_retention_prune')
    where exists (select 1 from cron.job where jobname = 'audit_logs_retention_prune');

    perform cron.schedule(
      'audit_logs_retention_prune',
      '0 3 * * *',  -- nightly at 03:00 UTC
      $cron$ delete from public.audit_logs where created_at < now() - interval '4 months'; $cron$
    );
    raise notice 'audit_logs_retention_prune scheduled (nightly 03:00 UTC, 4-month retention).';
  else
    raise notice 'pg_cron not installed — audit_logs retention NOT scheduled. Enable pg_cron in Supabase (Database → Extensions) then re-run this migration.';
  end if;
end $$;
