import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Cross-device propagation regressions.
 *
 * Symptom these pin: a sale made on device A never reached device B (bill,
 * cash drawer, transaction row all missing), while a payment propagated fine.
 * A sale emits events across five tables over the whole upload pass, so it is
 * far more exposed than a payment to the two defects below:
 *
 *  1. Wake-ups arriving during an in-flight catch-up were dropped outright —
 *     the `isProcessing` guard returned early and nothing re-triggered. The
 *     in-flight pass holds the branch busy for the length of its full
 *     `refreshData()` rehydration, which is exactly when the rest of a sale's
 *     events land.
 *  2. `initializeSyncState` fast-forwards the cursor to the server's max
 *     version. Post-sync it was called unconditionally, so any event not yet
 *     processed was skipped forever — and since the post-write sync is
 *     upload-only, no download compensated.
 */

const syncStateStore = new Map<string, { branch_id: string; last_seen_event_version: number; updated_at: string }>();

vi.mock('../../lib/db', () => {
  const dbStub: Record<string, unknown> = {
    sync_state: {
      get: async (branchId: string) => syncStateStore.get(branchId),
      put: async (state: { branch_id: string; last_seen_event_version: number; updated_at: string }) => {
        syncStateStore.set(state.branch_id, state);
      },
    },
  };
  return { getDB: () => dbStub, db: dbStub };
});

const maxVersionOnServer = { value: 0 };

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'gt', 'in', 'order', 'limit']) {
        builder[method] = () => builder;
      }
      builder.maybeSingle = async () => ({ data: { version: maxVersionOnServer.value }, error: null });
      return builder;
    },
    channel: () => ({ on: () => ({ subscribe: () => undefined }), subscribe: () => undefined }),
    removeChannel: async () => undefined,
  },
}));

vi.mock('../../utils/clientId', () => ({
  getClientId: () => 'test-client',
  ORIGIN_CLIENT_METADATA_KEY: '__origin_client',
}));

vi.mock('../../utils/dateUtils', () => ({
  normalizeBillDateFromRemote: (r: { bill_date?: string }) => r.bill_date ?? null,
}));

const { EventStreamService } = await import('../eventStreamService');

const BRANCH = 'branch-1';
const STORE = 'store-1';

describe('event cursor is never fast-forwarded past unprocessed foreign events', () => {
  beforeEach(() => {
    syncStateStore.clear();
    maxVersionOnServer.value = 0;
  });

  it('seeds the cursor when the branch has none (cold start)', async () => {
    const service = new EventStreamService();
    maxVersionOnServer.value = 42;

    await service.ensureSyncStateInitialized(BRANCH);

    expect(syncStateStore.get(BRANCH)?.last_seen_event_version).toBe(42);
  });

  it('leaves an established cursor alone even when the server is far ahead', async () => {
    const service = new EventStreamService();
    syncStateStore.set(BRANCH, {
      branch_id: BRANCH,
      last_seen_event_version: 7,
      updated_at: new Date(0).toISOString(),
    });
    // Device A emitted a sale: versions 8..13 are on the server, unprocessed here.
    maxVersionOnServer.value = 13;

    await service.ensureSyncStateInitialized(BRANCH);

    // Fast-forwarding to 13 would discard the entire sale.
    expect(syncStateStore.get(BRANCH)?.last_seen_event_version).toBe(7);
  });

  it('does not treat version 0 as "no cursor" (0 is a legitimate seeded value)', async () => {
    const service = new EventStreamService();
    syncStateStore.set(BRANCH, {
      branch_id: BRANCH,
      last_seen_event_version: 0,
      updated_at: new Date(0).toISOString(),
    });
    maxVersionOnServer.value = 99;

    await service.ensureSyncStateInitialized(BRANCH);

    expect(syncStateStore.get(BRANCH)?.last_seen_event_version).toBe(0);
  });
});

describe('wake-ups during an in-flight catch-up are drained, not dropped', () => {
  beforeEach(() => {
    syncStateStore.clear();
    maxVersionOnServer.value = 0;
    syncStateStore.set(BRANCH, {
      branch_id: BRANCH,
      last_seen_event_version: 1,
      updated_at: new Date(0).toISOString(),
    });
  });

  it('runs a follow-up pass for a signal that arrived mid-pass', async () => {
    const service = new EventStreamService();
    let release: (() => void) | undefined;
    const passes: number[] = [];

    // Stand in for the real pass: the first one blocks (as a full refreshData()
    // would), giving the test a window to deliver a concurrent wake-up.
    const runPass = vi.fn(async () => {
      passes.push(passes.length + 1);
      if (passes.length === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return { processed: 1, errors: [], last_version: passes.length + 1 };
    });
    (service as unknown as { runCatchUpPass: typeof runPass }).runCatchUpPass = runPass;

    const inFlight = service.catchUp(BRANCH, STORE);
    await vi.waitFor(() => expect(passes.length).toBe(1));

    // Realtime signal lands while pass 1 is still running.
    const concurrent = await service.catchUp(BRANCH, STORE);
    expect(concurrent.skipped).toBe(true);

    release?.();
    const result = await inFlight;

    expect(runPass).toHaveBeenCalledTimes(2);
    expect(result.processed).toBe(2);
  });

  it('makes a single pass when nothing else signalled', async () => {
    const service = new EventStreamService();
    const runPass = vi.fn(async () => ({ processed: 1, errors: [], last_version: 2 }));
    (service as unknown as { runCatchUpPass: typeof runPass }).runCatchUpPass = runPass;

    await service.catchUp(BRANCH, STORE);

    expect(runPass).toHaveBeenCalledTimes(1);
  });

  it('does not loop forever when every pass re-arms the flag', async () => {
    const service = new EventStreamService();
    const runPass = vi.fn(async () => {
      (service as unknown as { catchUpRequested: Map<string, boolean> }).catchUpRequested.set(BRANCH, true);
      return { processed: 1, errors: [], last_version: 2 };
    });
    (service as unknown as { runCatchUpPass: typeof runPass }).runCatchUpPass = runPass;

    await service.catchUp(BRANCH, STORE);

    expect(runPass.mock.calls.length).toBeLessThanOrEqual(20);
    expect(runPass.mock.calls.length).toBeGreaterThan(1);
  });
});
