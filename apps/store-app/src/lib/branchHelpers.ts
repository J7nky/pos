/**
 * Branch validation and helper utilities
 * Ensures all branch-scoped operations have valid branch context
 */

import { db } from './db';

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
 * @returns Branch ID or null if no branch exists
 */
export async function getDefaultBranchId(storeId: string): Promise<string | null> {
  const branch = await db.branches
    .where('store_id')
    .equals(storeId)
    .and(b => !b._deleted)
    .first();
  console.log('store 675443 ',db.branches.toArray())
  
  return branch?.id || null;
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
 * @returns Branch ID of existing or newly created branch
 */
export async function ensureDefaultBranch(storeId: string): Promise<string> {
  let branchId = await getDefaultBranchId(storeId);
  
  if (!branchId) {
    // Create default branch
    const store = await db.stores.get(storeId);
    if (!store) {
      throw new Error(`Store not found: ${storeId}`);
    }
    
    const newBranch = {
      store_id: storeId,
      name: 'Main Branch',
      address: (store as any).address || null,
      phone: (store as any).phone || null,
      _synced: false,
      _deleted: false
    };
    
    branchId = await db.branches.add(newBranch as any);
    console.log(`✅ Created default branch for store ${storeId}: ${branchId}`);
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
