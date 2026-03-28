import { useEffect, type MutableRefObject } from 'react';
import { getDB } from '../../lib/db';

/**
 * When the authenticated store changes, wipe IndexedDB and reload so Dexie state
 * cannot leak across stores.
 */
export function useStoreSwitchLifecycle(
  storeId: string | null,
  previousStoreIdRef: MutableRefObject<string | null>,
  isClearingStorageRef: MutableRefObject<boolean>
): void {
  useEffect(() => {
    const handleStoreChange = async () => {
      if (!storeId || isClearingStorageRef.current) return;
      const LAST_STORE_ID_KEY = 'last_accessed_store_id';
      let lastStoreId: string | null = null;
      try {
        lastStoreId = localStorage.getItem(LAST_STORE_ID_KEY);
      } catch (error) {
        console.warn('⚠️ Failed to read last store ID from localStorage:', error);
      }

      const previousStoreId = previousStoreIdRef.current || lastStoreId;
      if (previousStoreId !== null && previousStoreId !== storeId) {
        console.log(`🔄 Store changed from ${previousStoreId} to ${storeId}. Clearing all IndexedDB data...`);
        isClearingStorageRef.current = true;
        try {
          await getDB().close();
          await getDB().delete();
          try {
            localStorage.setItem(LAST_STORE_ID_KEY, storeId);
          } catch (error) {
            console.warn('⚠️ Failed to update last store ID in localStorage:', error);
          }
          console.log('✅ IndexedDB cleared successfully. Reloading page...');
          window.location.reload();
        } catch (error) {
          console.error('❌ Failed to clear IndexedDB:', error);
          isClearingStorageRef.current = false;
          try {
            await getDB().ensureOpen();
          } catch (reopenError) {
            console.error('❌ Failed to reopen database:', reopenError);
          }
        }
        return;
      }

      if (storeId) {
        if (previousStoreIdRef.current !== storeId) previousStoreIdRef.current = storeId;
        if (lastStoreId !== storeId) {
          try {
            localStorage.setItem(LAST_STORE_ID_KEY, storeId);
          } catch (error) {
            console.warn('⚠️ Failed to update last store ID in localStorage:', error);
          }
        }
      }
    };
    void handleStoreChange();
  // Refs are stable; effect should only re-run on storeId (matches original composer).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- previousStoreIdRef, isClearingStorageRef
  }, [storeId]);
}
