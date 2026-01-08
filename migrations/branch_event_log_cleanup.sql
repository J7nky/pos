-- Branch Event Log Cleanup Migration
-- Implements 30-day retention (no count-based safety net)
-- Events are deleted (not archived) since they're just sync signals, not business data
-- Devices offline >30 days use fullResync() anyway, so old events aren't needed

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Main deletion function
-- Deletes events older than retention_days (default 30 days)
-- Simple time-based retention - no count-based safety net needed
CREATE OR REPLACE FUNCTION delete_old_events(retention_days INTEGER DEFAULT 30)
RETURNS TABLE(
  events_deleted BIGINT,
  events_kept BIGINT,
  branches_affected BIGINT
) AS $$
DECLARE
  v_events_deleted BIGINT := 0;
  v_events_kept BIGINT := 0;
  v_branches_affected BIGINT := 0;
  v_cutoff_date TIMESTAMPTZ;
BEGIN
  -- Calculate cutoff date
  v_cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;
  
  -- Count branches that will have events deleted (before deletion)
  SELECT COUNT(DISTINCT branch_id) INTO v_branches_affected
  FROM branch_event_log
  WHERE occurred_at < v_cutoff_date;
  
  -- Delete events older than retention period
  DELETE FROM branch_event_log
  WHERE occurred_at < v_cutoff_date;
  
  GET DIAGNOSTICS v_events_deleted = ROW_COUNT;
  
  -- Count events kept (after deletion)
  SELECT COUNT(*) INTO v_events_kept
  FROM branch_event_log;
  
  -- Return statistics
  RETURN QUERY SELECT v_events_deleted, v_events_kept, v_branches_affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Convenience function for manual cleanup
-- Defaults to 30 days if not specified
CREATE OR REPLACE FUNCTION cleanup_events_now(retention_days INTEGER DEFAULT 30)
RETURNS TABLE(
  events_deleted BIGINT,
  events_kept BIGINT,
  branches_affected BIGINT
) AS $$
BEGIN
  RETURN QUERY SELECT * FROM delete_old_events(retention_days);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION delete_old_events TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_events_now TO authenticated;

-- Comments
COMMENT ON FUNCTION delete_old_events IS 
  'Deletes events older than retention_days (default 30). Simple time-based retention - no count-based safety net. Events are sync signals, not business data - safe to delete. Devices offline >30 days use fullResync() anyway.';

COMMENT ON FUNCTION cleanup_events_now IS 
  'Convenience function to trigger cleanup immediately. Defaults to 30-day retention.';

-- ============================================================================
-- MONITORING FUNCTIONS
-- ============================================================================

-- Statistics function for monitoring event log health
CREATE OR REPLACE FUNCTION get_event_log_statistics()
RETURNS TABLE(
  metric TEXT,
  value BIGINT,
  details JSONB
) AS $$
BEGIN
  RETURN QUERY
  
  -- Active table statistics
  SELECT 
    'active_events_count'::TEXT,
    COUNT(*)::BIGINT,
    jsonb_build_object(
      'oldest_event', MIN(occurred_at),
      'newest_event', MAX(occurred_at),
      'age_span_days', EXTRACT(EPOCH FROM (MAX(occurred_at) - MIN(occurred_at))) / 86400,
      'total_size_mb', pg_total_relation_size('branch_event_log') / 1024 / 1024
    )
  FROM branch_event_log
  
  UNION ALL
  
  -- Events per branch breakdown (active)
  SELECT 
    'events_per_branch_active'::TEXT,
    COUNT(*)::BIGINT,
    jsonb_build_object(
      'branch_id', branch_id,
      'event_count', COUNT(*),
      'oldest_version', MIN(version),
      'newest_version', MAX(version),
      'oldest_event', MIN(occurred_at),
      'newest_event', MAX(occurred_at)
    )
  FROM branch_event_log
  GROUP BY branch_id
  
  UNION ALL
  
  -- Age distribution (active)
  SELECT 
    'age_distribution_active'::TEXT,
    COUNT(*)::BIGINT,
    jsonb_build_object(
      'age_bucket', CASE
        WHEN occurred_at > NOW() - INTERVAL '1 day' THEN '0-1 days'
        WHEN occurred_at > NOW() - INTERVAL '7 days' THEN '1-7 days'
        WHEN occurred_at > NOW() - INTERVAL '30 days' THEN '7-30 days'
        WHEN occurred_at > NOW() - INTERVAL '90 days' THEN '30-90 days'
        ELSE '90+ days'
      END,
      'count', COUNT(*)
    )
  FROM branch_event_log
  GROUP BY CASE
    WHEN occurred_at > NOW() - INTERVAL '1 day' THEN '0-1 days'
    WHEN occurred_at > NOW() - INTERVAL '7 days' THEN '1-7 days'
    WHEN occurred_at > NOW() - INTERVAL '30 days' THEN '7-30 days'
    WHEN occurred_at > NOW() - INTERVAL '90 days' THEN '30-90 days'
    ELSE '90+ days'
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_event_log_statistics TO authenticated;

-- Comments
COMMENT ON FUNCTION get_event_log_statistics IS 
  'Returns comprehensive statistics about active event log including counts, age distribution, and per-branch breakdowns.';

-- ============================================================================
-- OPTIONAL: AUTOMATED SCHEDULING (pg_cron)
-- ============================================================================

-- Uncomment the following if pg_cron extension is available
-- This will schedule daily cleanup at 2 AM UTC

/*
-- Enable pg_cron extension (requires superuser)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily cleanup at 2 AM UTC
SELECT cron.schedule(
  'cleanup-branch-event-log',
  '0 2 * * *', -- Daily at 2 AM UTC
  $$SELECT delete_old_events(30)$$
);

-- To unschedule later:
-- SELECT cron.unschedule('cleanup-branch-event-log');
*/

-- ============================================================================
-- VERIFICATION QUERIES (for testing)
-- ============================================================================

-- Uncomment to test cleanup manually:
-- SELECT * FROM cleanup_events_now(30);

-- Uncomment to view statistics:
-- SELECT * FROM get_event_log_statistics();

-- Uncomment to check active table before cleanup:
-- SELECT COUNT(*), MIN(occurred_at), MAX(occurred_at) FROM branch_event_log;

-- Uncomment to check active table after cleanup:
-- SELECT COUNT(*), MIN(occurred_at), MAX(occurred_at) FROM branch_event_log;

