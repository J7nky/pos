import { describe, it, expect, vi, beforeEach } from 'vitest';

const syncMetadataRows: Array<{ last_synced_version?: number; store_id?: string | null }> = [];

vi.mock('../../src/lib/db', () => ({
  getDB: () => ({
    sync_metadata: {
      toArray: async () => syncMetadataRows,
    },
  }),
}));

import { syncService } from '../../src/services/syncService';

describe('syncService.hasExistingData', () => {
  beforeEach(() => {
    syncMetadataRows.length = 0;
  });

  it('returns false when there is no checkpoint data', async () => {
    await expect(syncService.hasExistingData('store-a')).resolves.toBe(false);
  });

  it('returns false when last_synced_version is 0', async () => {
    syncMetadataRows.push({ last_synced_version: 0, store_id: 'store-a' });
    await expect(syncService.hasExistingData('store-a')).resolves.toBe(false);
  });

  it('returns true when a row has version > 0 for the same store_id', async () => {
    syncMetadataRows.push({ last_synced_version: 2, store_id: 'store-a' });
    await expect(syncService.hasExistingData('store-a')).resolves.toBe(true);
  });

  it('treats legacy null store_id as matching any active store', async () => {
    syncMetadataRows.push({ last_synced_version: 5, store_id: null });
    await expect(syncService.hasExistingData('store-a')).resolves.toBe(true);
  });
});
