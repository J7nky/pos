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
 * Gets the stored branch preference for a store from localStorage
 */
function getStoredBranchPreference(storeId: string): string | null {
  try {
    const key = `branch_preference_${storeId}`;
    const stored = localStorage.getItem(key);
    return stored || null;
  } catch {
    return null;
  }
}

/**
 * Stores the branch preference for a store in localStorage
 */
function setStoredBranchPreference(storeId: string, branchId: string): void {
  try {
    const key = `branch_preference_${storeId}`;
    localStorage.setItem(key, branchId);
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Gets the default branch for a store with deterministic selection
 * Priority:
 * 1. Stored preference (from localStorage)
 * 2. Synced branches (prefer "Main Branch" by name, then by creation date)
 * 3. Any non-deleted branch (prefer "Main Branch" by name, then by creation date)
 * @returns Branch ID or null if no branch exists
 */
export async function getDefaultBranchId(storeId: string): Promise<string | null> {
  const branches = await db.branches
    .where('store_id')
    .equals(storeId)
    .filter(b => !b._deleted)
    .toArray();
  
  if (branches.length === 0) {
    return null;
  }
  
  // 1. Check stored preference first
  const storedPreference = getStoredBranchPreference(storeId);
  if (storedPreference) {
    const preferredBranch = branches.find(b => b.id === storedPreference);
    if (preferredBranch) {
      return preferredBranch.id;
    }
    // Stored preference is invalid, clear it
    try {
      localStorage.removeItem(`branch_preference_${storeId}`);
    } catch {
      // Ignore
    }
  }
  
  // 2. Prefer synced branches, with deterministic selection
  const syncedBranches = branches.filter(b => b._synced === true);
  if (syncedBranches.length > 0) {
    // Prefer "Main Branch" by name, then by creation date (oldest first)
    const mainBranch = syncedBranches.find(b => b.name.toLowerCase().includes('main'));
    if (mainBranch) {
      setStoredBranchPreference(storeId, mainBranch.id);
      return mainBranch.id;
    }
    // Sort by creation date (oldest first) for deterministic selection
    const sorted = syncedBranches.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    setStoredBranchPreference(storeId, sorted[0].id);
    return sorted[0].id;
  }
  
  // 3. Fall back to any branch with deterministic selection
  const mainBranch = branches.find(b => b.name.toLowerCase().includes('main'));
  if (mainBranch) {
    setStoredBranchPreference(storeId, mainBranch.id);
    return mainBranch.id;
  }
  
  // Sort by creation date (oldest first) for deterministic selection
  const sorted = branches.sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  setStoredBranchPreference(storeId, sorted[0].id);
  return sorted[0].id;
}

/**
 * Gets all active branches for a store
 */
export async function getStoreBranches(storeId: string) {
  return db.branches
    .where('store_id')
    .equals(storeId)
    .filter(b => !b._deleted)
    .toArray();
}

/**
 * Ensures a store has at least one branch, creates default if needed
 * Implements retry logic with exponential backoff to wait for data initialization
 * @returns Branch ID of existing or newly created branch
 */
export async function ensureDefaultBranch(storeId: string): Promise<string> {
  const maxRetries = 5;
  const initialDelay = 500; // Start with 500ms
  let branchId: string | null = null;
  
  // Retry logic with exponential backoff
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    branchId = await getDefaultBranchId(storeId);
    
    if (branchId) {
      // Found a branch, store preference and return
      setStoredBranchPreference(storeId, branchId);
      const branch = await db.branches.get(branchId);
      if (branch?._synced) {
        console.log(`✅ Using synced branch from Supabase: ${branchId}`);
      } else {
        console.log(`⚠️ Using local branch: ${branchId}. Waiting for Supabase branch to sync...`);
      }
      return branchId;
    }
    
    // No branch found yet, wait before retrying (exponential backoff)
    if (attempt < maxRetries - 1) {
      const delay = initialDelay * Math.pow(2, attempt);
      console.log(`⏳ No branch found for store ${storeId}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Still no branch after retries - create a local one as fallback
  // This handles cases where store hasn't been synced yet or is offline
  console.log(`⚠️ No branch found after ${maxRetries} attempts, creating fallback branch...`);
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
    setStoredBranchPreference(storeId, branchId);
    console.log(`✅ Created local fallback branch for store ${storeId}: ${branchId}`);
    console.log(`⚠️ Note: This is a temporary branch. The correct branch from Supabase will be used once synced.`);
    return branchId;
  } catch (error) {
    // If add fails, try to get the branch one more time (might have been synced during the add)
    branchId = await getDefaultBranchId(storeId);
    if (!branchId) {
      console.error(`❌ Failed to create branch for store ${storeId}:`, error);
      throw new Error(`Could not create or find branch for store: ${storeId}`);
    }
    setStoredBranchPreference(storeId, branchId);
    return branchId;
  }
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
  // Update stored preference when branch is explicitly selected
  setStoredBranchPreference(storeId, branchId);
  return { storeId, branchId };
}

/**
 * Sets the branch preference for a store (useful for branch selection UI)
 */
export function setBranchPreference(storeId: string, branchId: string): void {
  setStoredBranchPreference(storeId, branchId);
}
