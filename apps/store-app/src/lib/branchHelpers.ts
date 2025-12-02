/**
 * Branch validation and helper utilities
 * Ensures all branch-scoped operations have valid branch context
 */

import { db, createId } from './db';

/**
 * Validates that a branch exists and belongs to the specified store
 * @throws Error if branch is invalid or doesn't belong to store
 */
export async function validateBranch(storeId: string, branchId: string): Promise<void> {
  const branch = await db.branches.get(branchId);
  
  if (!branch) {
    throw new Error(`Branch not found: ${branchId}`);
  }
  
  if (branch._deleted) {
    throw new Error(`Branch is deleted: ${branchId}`);
  }
  
  if (branch.store_id !== storeId) {
    throw new Error(`Branch ${branchId} does not belong to store ${storeId}`);
  }
}

/**
 * Gets the default branch for a store (first active branch)
 * Prefers synced branches over local-only branches
 * @returns Branch ID or null if no branch exists
 */
export async function getDefaultBranchId(storeId: string): Promise<string | null> {
  const branches = await db.branches
    .where('store_id')
    .equals(storeId)
    .and(b => !b._deleted)
    .toArray();
  
  // Prefer synced branches (from Supabase) over local-only branches
  const syncedBranch = branches.find(b => b._synced === true);
  if (syncedBranch) {
    return syncedBranch.id;
  }
  
  // Fall back to any branch if no synced branch exists
  const anyBranch = branches[0];
  return anyBranch?.id || null;
}

/**
 * Gets all active branches for a store
 */
export async function getStoreBranches(storeId: string) {
  return db.branches
    .where('store_id')
    .equals(storeId)
    .and(b => !b._deleted)
    .toArray();
}

/**
 * Ensures a store has at least one branch, creates default if needed
 * Waits briefly for branches to sync from Supabase before creating a local one
 * @returns Branch ID of existing or newly created branch
 */
export async function ensureDefaultBranch(storeId: string): Promise<string> {
  // First, check for existing branches (prefer synced ones)
  let branchId = await getDefaultBranchId(storeId);
  
  if (!branchId) {
    // Wait a short time for branches to sync from Supabase (in case sync is in progress)
    // This prevents creating duplicate local branches when Supabase branches are being synced
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check again after waiting
    branchId = await getDefaultBranchId(storeId);
  }
  
  if (!branchId) {
    // Still no branch - create a local one as fallback
    // This handles cases where store hasn't been synced yet or is offline
    const store = await db.stores.get(storeId);
    
    const newBranch = {
      id: createId(),
      store_id: storeId,
      name: 'Main Branch',
      address: store ? ((store as any).address || null) : null,
      phone: store ? ((store as any).phone || null) : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _synced: false,
      _deleted: false
    };
    
    try {
      branchId = await db.branches.add(newBranch as any);
      console.log(`✅ Created local fallback branch for store ${storeId}: ${branchId}`);
      console.log(`⚠️ Note: This is a temporary branch. The correct branch from Supabase will be used once synced.`);
    } catch (error) {
      // If add fails, try to get the branch one more time (might have been synced during the add)
      branchId = await getDefaultBranchId(storeId);
      if (!branchId) {
        console.warn(`⚠️ Failed to create branch for store ${storeId}`);
        throw new Error(`Could not create or find branch for store: ${storeId}`);
      }
    }
  } else {
    const branch = await db.branches.get(branchId);
    if (branch?._synced) {
      console.log(`✅ Using synced branch from Supabase: ${branchId}`);
    } else {
      console.log(`⚠️ Using local branch: ${branchId}. Waiting for Supabase branch to sync...`);
    }
  }
  
  return branchId;
}

/**
 * Branch context for operations
 */
export interface BranchContext {
  storeId: string;
  branchId: string;
}

/**
 * Validates and returns branch context
 */
export async function getBranchContext(storeId: string, branchId: string): Promise<BranchContext> {
  await validateBranch(storeId, branchId);
  return { storeId, branchId };
}
