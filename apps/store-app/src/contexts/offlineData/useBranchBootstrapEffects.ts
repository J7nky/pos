import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { getDB } from '../../lib/db';
import { syncService } from '../../services/syncOrchestrator';
import { ensureDefaultBranch } from '../../lib/branchHelpers';

export type BranchSyncStatus = {
  isSyncing: boolean;
  isComplete: boolean;
  error: string | null;
};

/** Minimal user shape for branch bootstrap (matches SupabaseAuth UserProfile fields used here). */
export type BranchBootstrapUser = {
  id: string;
  store_id: string;
  role: 'admin' | 'manager' | 'cashier';
  branch_id: string | null;
} | null;

export interface UseBranchBootstrapEffectsParams {
  storeId: string | null;
  userProfile: BranchBootstrapUser;
  isOnline: boolean;
  currentBranchId: string | null;
  setCurrentBranchId: Dispatch<SetStateAction<string | null>>;
  branchSyncStatus: BranchSyncStatus;
  setBranchSyncStatus: Dispatch<SetStateAction<BranchSyncStatus>>;
  isBranchSyncInProgressRef: MutableRefObject<boolean>;
  refreshData: () => Promise<void>;
}

/**
 * Syncs branches when needed for admin / cashier / manager, restores admin preference,
 * assigns manager/cashier branch, and switches local-only branch to synced copy after delay.
 */
export function useBranchBootstrapEffects({
  storeId,
  userProfile,
  isOnline,
  currentBranchId,
  setCurrentBranchId,
  branchSyncStatus,
  setBranchSyncStatus,
  isBranchSyncInProgressRef,
  refreshData,
}: UseBranchBootstrapEffectsParams): void {
  useEffect(() => {
    const syncBranchesForAdmin = async () => {
      if (isBranchSyncInProgressRef.current) {
        console.log('⏭️ Branch sync already in progress, skipping');
        return;
      }
      if (branchSyncStatus.isSyncing || branchSyncStatus.isComplete) return;
      if (!storeId || !userProfile || !isOnline) return;
      if (userProfile.role !== 'admin' || userProfile.branch_id !== null || currentBranchId) return;

      const existingBranches = await getDB()
        .branches.where('store_id')
        .equals(storeId)
        .filter(b => !(b._deleted === true))
        .count();
      if (existingBranches > 0) {
        console.log(`✅ Branches already synced (${existingBranches} branches found)`);
        setBranchSyncStatus({ isSyncing: false, isComplete: true, error: null });
        return;
      }

      console.log('🔄 Admin user detected - syncing branches immediately for branch selection...');
      isBranchSyncInProgressRef.current = true;
      setBranchSyncStatus({ isSyncing: true, isComplete: false, error: null });

      try {
        const syncResult = await syncService.syncStoresAndBranches(storeId);
        if (syncResult.success) {
          console.log(`✅ Branches synced successfully: ${syncResult.synced.downloaded} branches downloaded`);
          await new Promise(resolve => setTimeout(resolve, 300));
          try {
            await getDB().ensureOpen();
            const branchCount = await getDB()
              .branches.where('store_id')
              .equals(storeId)
              .filter(b => !(b._deleted === true))
              .count();
            if (branchCount > 0 || syncResult.synced.downloaded === 0) {
              setBranchSyncStatus({ isSyncing: false, isComplete: true, error: null });
            } else {
              console.log('⏳ Waiting for branches to become queryable...');
              await new Promise(resolve => setTimeout(resolve, 500));
              const retryCount = await getDB()
                .branches.where('store_id')
                .equals(storeId)
                .filter(b => !(b._deleted === true))
                .count();
              setBranchSyncStatus({
                isSyncing: false,
                isComplete: retryCount > 0,
                error: retryCount === 0 ? 'Branches synced but not yet queryable' : null,
              });
            }
          } catch (verifyError) {
            console.warn('⚠️ Failed to verify branches after sync:', verifyError);
            setBranchSyncStatus({ isSyncing: false, isComplete: true, error: null });
          }
        } else {
          console.error('❌ Failed to sync branches:', syncResult.errors);
          setBranchSyncStatus({ isSyncing: false, isComplete: false, error: syncResult.errors.join(', ') });
        }
      } catch (error) {
        console.error('❌ Error syncing branches for admin:', error);
        setBranchSyncStatus({
          isSyncing: false,
          isComplete: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        isBranchSyncInProgressRef.current = false;
      }
    };
    void syncBranchesForAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, userProfile?.role, userProfile?.branch_id, isOnline, currentBranchId]);

  useEffect(() => {
    const syncBranchesForCashierManager = async () => {
      if (!storeId || !userProfile || !isOnline) return;
      if ((userProfile.role !== 'cashier' && userProfile.role !== 'manager') || !userProfile.branch_id || currentBranchId)
        return;

      const assignedBranch = await getDB().branches.get(userProfile.branch_id);
      if (assignedBranch && !assignedBranch._deleted && assignedBranch.store_id === storeId) {
        console.log(`✅ Assigned branch already synced: ${userProfile.branch_id}`);
        return;
      }

      console.log(`🔄 ${userProfile.role} user detected - syncing branches to ensure assigned branch is available...`);
      try {
        const syncResult = await syncService.syncStoresAndBranches(storeId);
        if (syncResult.success) {
          console.log(
            `✅ Branches synced successfully for ${userProfile.role}: ${syncResult.synced.downloaded} branches downloaded`
          );
          await new Promise(resolve => setTimeout(resolve, 300));
          const branchAfterSync = await getDB().branches.get(userProfile.branch_id);
          if (branchAfterSync && !branchAfterSync._deleted && branchAfterSync.store_id === storeId) {
            console.log(`✅ Assigned branch is now available after sync: ${userProfile.branch_id}`);
          } else {
            console.warn(`⚠️ Assigned branch still not found after sync: ${userProfile.branch_id}`);
          }
        } else {
          console.error(`❌ Failed to sync branches for ${userProfile.role}:`, syncResult.errors);
        }
      } catch (error) {
        console.error(`❌ Error syncing branches for ${userProfile.role}:`, error);
      }
    };
    void syncBranchesForCashierManager();
  }, [storeId, userProfile, isOnline, currentBranchId]);

  useEffect(() => {
    const initializeBranch = async () => {
      if (!storeId || !userProfile || currentBranchId) return;

      try {
        if (userProfile.role === 'admin' && userProfile.branch_id === null) {
          const storedBranchId = localStorage.getItem(`branch_preference_${storeId}`);
          if (storedBranchId) {
            const branch = await getDB().branches.get(storedBranchId);
            if (branch && !branch._deleted && branch.store_id === storeId) {
              setCurrentBranchId(storedBranchId);
              console.log('✅ Admin: Restored preferred branch:', storedBranchId);
              return;
            }
            localStorage.removeItem(`branch_preference_${storeId}`);
            console.log('⚠️ Admin: Stored branch preference was invalid, cleared');
          }
          if (branchSyncStatus.isSyncing) {
            console.log('⏳ Admin: Waiting for branch sync to complete...');
            return;
          }
          console.log('⏳ Admin: Waiting for branch selection via BranchSelectionScreen');
          return;
        }

        if ((userProfile.role === 'manager' || userProfile.role === 'cashier') && userProfile.branch_id) {
          let branch = await getDB().branches.get(userProfile.branch_id);
          if (!branch && isOnline) {
            console.log(`⏳ ${userProfile.role}: Assigned branch not found in IndexedDB, waiting for sync...`);
            for (let attempt = 0; attempt < 6; attempt++) {
              await new Promise(resolve => setTimeout(resolve, 500));
              branch = await getDB().branches.get(userProfile.branch_id);
              if (branch) {
                console.log(`✅ ${userProfile.role}: Branch found after ${attempt + 1} attempt(s)`);
                break;
              }
            }
          }
          if (branch && !branch._deleted && branch.store_id === storeId) {
            setCurrentBranchId(userProfile.branch_id);
            console.log(`✅ ${userProfile.role}: Auto-assigned to branch:`, userProfile.branch_id);
          } else if (!branch) {
            console.error(
              `❌ ${userProfile.role}: Assigned branch not found in IndexedDB: ${userProfile.branch_id}. Please ensure you're online and try refreshing.`
            );
          } else if (branch._deleted) {
            console.error(`❌ ${userProfile.role}: Assigned branch has been deleted: ${userProfile.branch_id}`);
          } else if (branch.store_id !== storeId) {
            console.error(`❌ ${userProfile.role}: Assigned branch belongs to different store: ${userProfile.branch_id}`);
          }
          return;
        }

        console.warn('⚠️ User does not match expected role patterns, attempting fallback branch initialization');
        const branchId = await ensureDefaultBranch(storeId);
        console.log('Branch Id Value: ', branchId);
        setCurrentBranchId(branchId);
        console.log('✅ Fallback: Auto-initialized default branch for store:', branchId);
      } catch (error) {
        console.error('❌ Failed to initialize branch:', error);
      }
    };
    void initializeBranch();
  }, [storeId, currentBranchId, userProfile, branchSyncStatus, isOnline, setCurrentBranchId]);

  useEffect(() => {
    const checkForSyncedBranch = async () => {
      if (!storeId || !currentBranchId) return;
      const currentBranch = await getDB().branches.get(currentBranchId);
      if (currentBranch && !currentBranch._synced && !currentBranch._lastSyncedAt) {
        const syncedBranch = await getDB()
          .branches.where('store_id')
          .equals(storeId)
          .and(b => !b._deleted && b._synced === true)
          .first();
        if (syncedBranch && syncedBranch.id !== currentBranchId) {
          console.log(`🔄 Switching from local branch ${currentBranchId} to synced branch ${syncedBranch.id}`);
          setCurrentBranchId(syncedBranch.id);
        }
      }
    };
    const timeoutId = setTimeout(() => {
      void checkForSyncedBranch();
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [storeId, currentBranchId, refreshData, setCurrentBranchId]);
}
