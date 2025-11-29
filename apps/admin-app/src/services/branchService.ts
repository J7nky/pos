// Branch Service - Admin App
// Handles all branch CRUD operations via Supabase

import { supabase } from '../lib/supabase';
import {
  Branch,
  CreateBranchInput,
  UpdateBranchInput,
  BranchFilters,
  getSubscriptionLimits,
  SubscriptionTier,
} from '../types';

// ============================================================================
// BRANCH CRUD OPERATIONS
// ============================================================================

/**
 * Get all branches for a store
 */
export async function getBranches(storeId: string, filters?: BranchFilters): Promise<Branch[]> {
  let query = supabase
    .from('branches')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: true });

  if (filters?.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }

  if (filters?.search) {
    query = query.or(`name.ilike.%${filters.search}%,address.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching branches:', error);
    throw new Error(`Failed to fetch branches: ${error.message}`);
  }

  return data || [];
}

/**
 * Get a single branch by ID
 */
export async function getBranch(branchId: string): Promise<Branch | null> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('id', branchId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error fetching branch:', error);
    throw new Error(`Failed to fetch branch: ${error.message}`);
  }

  return data;
}

/**
 * Get branch count for a store
 */
export async function getBranchCount(storeId: string): Promise<number> {
  const { count, error } = await supabase
    .from('branches')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId);

  if (error) {
    console.error('Error counting branches:', error);
    throw new Error(`Failed to count branches: ${error.message}`);
  }

  return count || 0;
}

/**
 * Check if a store can add more branches based on subscription
 */
export async function canCreateBranch(storeId: string): Promise<{
  canCreate: boolean;
  currentCount: number;
  limit: number;
  message?: string;
}> {
  // Get current branch count
  const currentCount = await getBranchCount(storeId);

  // Get subscription tier
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('tier')
    .eq('store_id', storeId)
    .single();

  const tier: SubscriptionTier = subscription?.tier || 'starter';
  const limits = getSubscriptionLimits(tier);
  const limit = limits.branches;

  if (currentCount >= limit) {
    return {
      canCreate: false,
      currentCount,
      limit,
      message: `Branch limit reached (${currentCount}/${limit}). Upgrade your subscription to add more branches.`,
    };
  }

  return {
    canCreate: true,
    currentCount,
    limit,
  };
}

/**
 * Create a new branch
 */
export async function createBranch(input: CreateBranchInput): Promise<Branch> {
  // Check if can create
  const { canCreate, message } = await canCreateBranch(input.store_id);
  
  if (!canCreate) {
    throw new Error(message || 'Cannot create branch');
  }

  const branchData = {
    store_id: input.store_id,
    name: input.name,
    address: input.address || null,
    phone: input.phone || null,
    is_active: true,
  };

  const { data, error } = await supabase
    .from('branches')
    .insert(branchData)
    .select()
    .single();

  if (error) {
    console.error('Error creating branch:', error);
    throw new Error(`Failed to create branch: ${error.message}`);
  }

  return data;
}

/**
 * Update a branch
 */
export async function updateBranch(branchId: string, input: UpdateBranchInput): Promise<Branch> {
  const { data, error } = await supabase
    .from('branches')
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq('id', branchId)
    .select()
    .single();

  if (error) {
    console.error('Error updating branch:', error);
    throw new Error(`Failed to update branch: ${error.message}`);
  }

  return data;
}

/**
 * Deactivate a branch (soft delete)
 */
export async function deactivateBranch(branchId: string): Promise<void> {
  // Check if this is the last active branch
  const branch = await getBranch(branchId);
  if (!branch) {
    throw new Error('Branch not found');
  }

  const activeBranches = await getBranches(branch.store_id, { isActive: true });
  
  if (activeBranches.length <= 1) {
    throw new Error('Cannot deactivate the last active branch. A store must have at least one active branch.');
  }

  const { error } = await supabase
    .from('branches')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', branchId);

  if (error) {
    console.error('Error deactivating branch:', error);
    throw new Error(`Failed to deactivate branch: ${error.message}`);
  }
}

/**
 * Reactivate a branch
 */
export async function reactivateBranch(branchId: string): Promise<void> {
  const { error } = await supabase
    .from('branches')
    .update({
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', branchId);

  if (error) {
    console.error('Error reactivating branch:', error);
    throw new Error(`Failed to reactivate branch: ${error.message}`);
  }
}

/**
 * Delete a branch permanently (use with caution)
 * This will cascade delete all branch data
 */
export async function deleteBranch(branchId: string): Promise<void> {
  // Check if this is the last branch
  const branch = await getBranch(branchId);
  if (!branch) {
    throw new Error('Branch not found');
  }

  const branchCount = await getBranchCount(branch.store_id);
  
  if (branchCount <= 1) {
    throw new Error('Cannot delete the last branch. A store must have at least one branch.');
  }

  const { error } = await supabase
    .from('branches')
    .delete()
    .eq('id', branchId);

  if (error) {
    console.error('Error deleting branch:', error);
    throw new Error(`Failed to delete branch: ${error.message}`);
  }
}

// ============================================================================
// BRANCH STATISTICS
// ============================================================================

/**
 * Get branch statistics for a store
 */
export async function getBranchStats(storeId: string): Promise<{
  total: number;
  active: number;
  inactive: number;
}> {
  const branches = await getBranches(storeId);
  
  return {
    total: branches.length,
    active: branches.filter(b => b.is_active).length,
    inactive: branches.filter(b => !b.is_active).length,
  };
}
