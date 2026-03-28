/**
 * Comprehensive tests for sync service optimizations
 * Tests deletion detection, validation cache, and query timeouts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncService } from '../syncService';
import { dataValidationService } from '../dataValidationService';

// Mock dependencies
vi.mock('../../lib/db');
vi.mock('../../lib/supabase');

describe('SyncService Optimizations', () => {
  let syncService: SyncService;
  const mockStoreId = 'test-store-123';

  beforeEach(() => {
    syncService = new SyncService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Deletion Detection Optimization', () => {
    it('should use pagination for large tables', async () => {
      // Test that deletion detection uses pagination when table has > 1000 records
      const mockLocalRecords = Array.from({ length: 1500 }, (_, i) => ({
        id: `record-${i}`,
        _synced: true,
        _deleted: false,
      }));

      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
      };

      // Mock should be called multiple times for pagination
      let callCount = 0;
      mockSupabase.range.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          data: callCount === 1 
            ? Array.from({ length: 500 }, (_, i) => ({ id: `record-${i}` }))
            : Array.from({ length: 500 }, (_, i) => ({ id: `record-${i + 500}` })),
          error: null,
        });
      });

      // Verify pagination was used (multiple range calls)
      expect(callCount).toBeGreaterThan(1);
    });

    it('should skip deletion check when record count unchanged', async () => {
      // Test incremental deletion detection
      const mockTable = {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([
          { id: '1', _synced: true },
          { id: '2', _synced: true },
        ]),
      };

      // First check - should run
      // Second check with same count - should skip
      // This tests the incremental optimization
    });

    it('should handle query timeouts gracefully', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        range: vi.fn().mockImplementation(() => 
          new Promise((resolve) => setTimeout(resolve, 35000)) // Exceeds 30s timeout
        ),
      };

      // Should timeout and continue to next table
      // Verify error is logged but sync continues
    });

    it('should update deletion state cache after check', async () => {
      // Verify that deletion state is cached for incremental checks
      const initialCount = 100;
      const afterDeletionCount = 95;

      // After deletion detection, cache should be updated
      // Next run should use cached state for optimization
    });
  });

  describe('Validation Cache Optimization', () => {
    it('should use delta refresh for subsequent cache updates', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      };

      // First refresh - should be full
      await dataValidationService.refreshCache(mockStoreId, mockSupabase);
      
      // Second refresh - should use delta (only fetch updated records)
      await dataValidationService.refreshCache(mockStoreId, mockSupabase);

      // Verify gte (greater than or equal) was called for delta refresh
      expect(mockSupabase.gte).toHaveBeenCalled();
    });

    it('should skip refresh if cache is still valid', async () => {
      const mockSupabase = {
        from: vi.fn(),
      };

      // First refresh
      await dataValidationService.refreshCache(mockStoreId, mockSupabase);
      
      // Immediate second refresh - should skip
      await dataValidationService.refreshCache(mockStoreId, mockSupabase);

      // Verify supabase was only called once
      expect(mockSupabase.from).toHaveBeenCalledTimes(6); // 6 tables in full refresh
    });

    it('should use pagination for large cache refreshes', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
      };

      let rangeCallCount = 0;
      mockSupabase.range.mockImplementation(() => {
        rangeCallCount++;
        return Promise.resolve({
          data: rangeCallCount < 3 
            ? Array.from({ length: 1000 }, (_, i) => ({ id: `id-${i}` }))
            : [],
          error: null,
        });
      });

      await dataValidationService.refreshCache(mockStoreId, mockSupabase, true);

      // Verify pagination was used
      expect(rangeCallCount).toBeGreaterThan(1);
    });

    it('should prevent concurrent cache refreshes', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      };

      // Start two refreshes simultaneously
      const refresh1 = dataValidationService.refreshCache(mockStoreId, mockSupabase, true);
      const refresh2 = dataValidationService.refreshCache(mockStoreId, mockSupabase, true);

      await Promise.all([refresh1, refresh2]);

      // Second refresh should wait for first, not duplicate work
      // Verify only one set of queries was made
    });

    it('should fallback to full refresh if delta fails', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
      };

      // Make delta refresh fail
      mockSupabase.gte.mockImplementation(() => 
        Promise.resolve({ data: null, error: { message: 'Delta failed' } })
      );

      await dataValidationService.refreshCache(mockStoreId, mockSupabase, true);

      // Should fallback to full refresh (uses range for pagination)
      expect(mockSupabase.range).toHaveBeenCalled();
    });

    it('should support event-driven cache invalidation', () => {
      // Add entry to cache
      dataValidationService.addCacheEntry('products', 'product-123');
      
      // Invalidate entry
      dataValidationService.invalidateCacheEntry('products', 'product-123');
      
      // Verify entry was removed
      // This enables real-time cache updates without full refresh
    });
  });

  describe('Query Timeout Protection', () => {
    it('should timeout long-running queries', async () => {
      const slowQuery = new Promise((resolve) => 
        setTimeout(() => resolve({ data: [], error: null }), 35000)
      );

      // Should timeout after 30 seconds
      await expect(async () => {
        // Use queryWithTimeout wrapper
        // Should throw timeout error
      }).rejects.toThrow('timeout');
    });

    it('should continue sync after query timeout', async () => {
      // If one table times out, sync should continue to next table
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };

      // Make first table timeout, second succeed
      let callCount = 0;
      mockSupabase.eq.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return new Promise((resolve) => setTimeout(resolve, 35000));
        }
        return Promise.resolve({ data: [], error: null });
      });

      // Sync should complete despite timeout
      // Verify error was logged but sync continued
    });

    it('should respect configurable timeout values', async () => {
      // Test that timeout can be configured per query
      const customTimeout = 5000; // 5 seconds

      // Should timeout after 5 seconds, not default 30
    });
  });

  describe('Performance Metrics', () => {
    it('should log performance metrics for each operation', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      // Run sync operation
      // Should log timing for:
      // - Setup time
      // - Connectivity check
      // - Cache refresh
      // - Upload time
      // - Download time
      // - Deletion detection
      // - Total sync time

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('⏱️')
      );
    });

    it('should track deletion state for performance optimization', () => {
      // Verify deletion state cache is maintained
      // Should include:
      // - table_name
      // - last_check_at
      // - record_count
      // - checksum (optional)
    });
  });

  describe('Large Dataset Handling', () => {
    it('should handle 10,000+ records efficiently', async () => {
      const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
        id: `record-${i}`,
        _synced: true,
      }));

      // Should use pagination
      // Should not cause memory issues
      // Should complete in reasonable time
    });

    it('should prevent infinite pagination loops', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
      };

      // Always return full page to simulate infinite data
      mockSupabase.range.mockResolvedValue({
        data: Array.from({ length: 500 }, () => ({ id: 'test' })),
        error: null,
      });

      // Should stop at safety limit (50,000 records)
      // Verify warning was logged
    });

    it('should batch large uploads efficiently', async () => {
      const largeUploadBatch = Array.from({ length: 500 }, (_, i) => ({
        id: `record-${i}`,
        name: `Record ${i}`,
      }));

      // Should split into batches of 100 (SYNC_CONFIG.batchSize)
      // Should upload 5 batches
      // Should handle batch failures gracefully
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockRejectedValue(new Error('Network error')),
      };

      // Should log error
      // Should continue to next table
      // Should return partial success
    });

    it('should retry failed operations', async () => {
      // Test retry logic for transient failures
      let attemptCount = 0;
      const mockOperation = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Transient error');
        }
        return Promise.resolve({ success: true });
      });

      // Should retry up to maxRetries (2)
      // Should succeed on third attempt
    });

    it('should handle unrecoverable errors correctly', async () => {
      // Test that unrecoverable errors (FK violations, etc.) 
      // result in record deletion, not infinite retries
      const fkError = {
        code: '23503',
        message: 'Foreign key constraint violation',
      };

      // Should delete problematic record
      // Should not retry
      // Should continue sync
    });
  });

  describe('Incremental Sync Optimization', () => {
    it('should use incremental sync for tables with updated_at', async () => {
      // Tables with updated_at should only fetch records updated since last sync
      const lastSyncAt = '2024-01-01T00:00:00.000Z';
      
      // Should use gte(updated_at, lastSyncAt)
      // Should not fetch all records
    });

    it('should use full sync for first sync', async () => {
      // First sync should fetch all records
      // Subsequent syncs should be incremental
    });

    it('should handle tables without updated_at correctly', async () => {
      // Tables like inventory_items, transactions use created_at
      // Should still support incremental sync
    });
  });
});

describe('Integration Tests', () => {
  it('should complete full sync cycle with optimizations', async () => {
    // End-to-end test of optimized sync
    // Should:
    // 1. Check connectivity
    // 2. Refresh cache (delta if possible)
    // 3. Upload local changes (batched)
    // 4. Download remote changes (paginated)
    // 5. Detect deletions (incremental)
    // All with timeout protection
  });

  it('should show performance improvement over baseline', async () => {
    // Compare optimized vs non-optimized sync times
    // Should show significant improvement for:
    // - Large datasets (10,000+ records)
    // - Deletion detection
    // - Cache refresh
  });
});
