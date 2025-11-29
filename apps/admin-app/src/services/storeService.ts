// Store Service - Admin App
// Handles all store CRUD operations via Supabase

import { supabase } from '../lib/supabase';
import {
  Store,
  StoreWithStats,
  CreateStoreInput,
  UpdateStoreInput,
  StoreFilters,
} from '../types';

// ============================================================================
// STORE CRUD OPERATIONS
// ============================================================================

/**
 * Get all stores with stats (branches count, users count, subscription)
 * Note: subscriptions table may not exist yet - handle gracefully
 */
export async function getStores(filters?: StoreFilters): Promise<StoreWithStats[]> {
  // First try with subscriptions join
  let query = supabase
    .from('stores')
    .select(`
      *,
      branches:branches(count),
      users:users(count)
    `)
    .order('created_at', { ascending: false });

  // Apply filters
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.search) {
    query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching stores:', error);
    throw new Error(`Failed to fetch stores: ${error.message}`);
  }

  // Try to fetch subscriptions separately (table may not exist)
  let subscriptionsMap: Record<string, any> = {};
  try {
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('*');
    if (subs) {
      subscriptionsMap = subs.reduce((acc: Record<string, any>, sub: any) => {
        acc[sub.store_id] = sub;
        return acc;
      }, {});
    }
  } catch (e) {
    // Subscriptions table doesn't exist yet - that's OK
    console.log('Subscriptions table not available yet');
  }

  // Transform the response to include counts
  return (data || []).map((store: any) => ({
    ...store,
    branches_count: store.branches?.[0]?.count || 0,
    users_count: store.users?.[0]?.count || 0,
    subscription: subscriptionsMap[store.id] || null,
  }));
}

/**
 * Get a single store by ID with full details
 */
export async function getStore(storeId: string): Promise<StoreWithStats | null> {
  const { data, error } = await supabase
    .from('stores')
    .select(`
      *,
      branches:branches(count),
      users:users(count)
    `)
    .eq('id', storeId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error fetching store:', error);
    throw new Error(`Failed to fetch store: ${error.message}`);
  }

  // Try to fetch subscription separately
  let subscription = null;
  try {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('store_id', storeId)
      .single();
    subscription = sub;
  } catch (e) {
    // Subscriptions table doesn't exist yet
  }

  return {
    ...data,
    subscription,
    branches_count: data.branches?.[0]?.count || 0,
    users_count: data.users?.[0]?.count || 0,
  };
}

/**
 * Create a new store
 * Note: This triggers automatic creation of:
 * 1. Default "Main Branch" (via database trigger)
 * 2. System entities (via RPC - to be called separately)
 * 3. Chart of accounts (via RPC - to be called separately)
 */
export async function createStore(input: CreateStoreInput): Promise<Store> {
  const storeData = {
    name: input.name,
    address: input.address || null,
    phone: input.phone || null,
    email: input.email || null,
    preferred_currency: input.preferred_currency || 'USD',
    preferred_language: input.preferred_language || 'en',
    preferred_commission_rate: input.preferred_commission_rate || 0,
    exchange_rate: input.exchange_rate || 89500,
    low_stock_alert: true,
    status: 'active' as const,
  };

  const { data, error } = await supabase
    .from('stores')
    .insert(storeData)
    .select()
    .single();

  if (error) {
    console.error('Error creating store:', error);
    throw new Error(`Failed to create store: ${error.message}`);
  }

  return data;
}

/**
 * Initialize accounting foundation for a store
 * Calls the RPC functions to create system entities and chart of accounts
 */
export async function initializeAccountingFoundation(storeId: string): Promise<void> {
  // Create system entities
  const { error: entitiesError } = await supabase
    .rpc('create_system_entities_for_store', { store_uuid: storeId });

  if (entitiesError) {
    console.error('Error creating system entities:', entitiesError);
    throw new Error(`Failed to create system entities: ${entitiesError.message}`);
  }

  // Create chart of accounts
  const { error: coaError } = await supabase
    .rpc('create_default_chart_of_accounts', { store_uuid: storeId });

  if (coaError) {
    console.error('Error creating chart of accounts:', coaError);
    throw new Error(`Failed to create chart of accounts: ${coaError.message}`);
  }
}

/**
 * Create a store with full initialization
 * This is the main function to use when creating a new store
 */
export async function createStoreWithInitialization(
  input: CreateStoreInput
): Promise<StoreWithStats> {
  // 1. Create the store (triggers auto-branch creation)
  const store = await createStore(input);

  // 2. Initialize accounting foundation
  try {
    await initializeAccountingFoundation(store.id);
  } catch (error) {
    // Log but don't fail - accounting can be initialized later
    console.error('Warning: Failed to initialize accounting foundation:', error);
  }

  // 3. Return store with stats
  return {
    ...store,
    branches_count: 1, // Default branch created by trigger
    users_count: 0,
    subscription: undefined,
  };
}

/**
 * Update a store
 */
export async function updateStore(storeId: string, input: UpdateStoreInput): Promise<Store> {
  const { data, error } = await supabase
    .from('stores')
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq('id', storeId)
    .select()
    .single();

  if (error) {
    console.error('Error updating store:', error);
    throw new Error(`Failed to update store: ${error.message}`);
  }

  return data;
}

/**
 * Archive a store (soft delete)
 */
export async function archiveStore(storeId: string): Promise<void> {
  const { error } = await supabase
    .from('stores')
    .update({
      status: 'archived',
      updated_at: new Date().toISOString(),
    })
    .eq('id', storeId);

  if (error) {
    console.error('Error archiving store:', error);
    throw new Error(`Failed to archive store: ${error.message}`);
  }
}

/**
 * Suspend a store
 */
export async function suspendStore(storeId: string): Promise<void> {
  const { error } = await supabase
    .from('stores')
    .update({
      status: 'suspended',
      updated_at: new Date().toISOString(),
    })
    .eq('id', storeId);

  if (error) {
    console.error('Error suspending store:', error);
    throw new Error(`Failed to suspend store: ${error.message}`);
  }
}

/**
 * Reactivate a store
 */
export async function reactivateStore(storeId: string): Promise<void> {
  const { error } = await supabase
    .from('stores')
    .update({
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', storeId);

  if (error) {
    console.error('Error reactivating store:', error);
    throw new Error(`Failed to reactivate store: ${error.message}`);
  }
}

/**
 * Delete a store permanently (use with caution)
 */
export async function deleteStore(storeId: string): Promise<void> {
  const { error } = await supabase
    .from('stores')
    .delete()
    .eq('id', storeId);

  if (error) {
    console.error('Error deleting store:', error);
    throw new Error(`Failed to delete store: ${error.message}`);
  }
}

// ============================================================================
// STORE STATISTICS
// ============================================================================

/**
 * Get store statistics for dashboard
 */
export async function getStoreStats(): Promise<{
  total: number;
  active: number;
  suspended: number;
  archived: number;
  trial: number;
}> {
  const { data, error } = await supabase
    .from('stores')
    .select('status, subscriptions(status)');

  if (error) {
    console.error('Error fetching store stats:', error);
    throw new Error(`Failed to fetch store stats: ${error.message}`);
  }

  const stores = data || [];
  
  return {
    total: stores.length,
    active: stores.filter((s: any) => s.status === 'active').length,
    suspended: stores.filter((s: any) => s.status === 'suspended').length,
    archived: stores.filter((s: any) => s.status === 'archived').length,
    trial: stores.filter((s: any) => s.subscriptions?.[0]?.status === 'trial').length,
  };
}

/**
 * Get total counts for dashboard
 */
export async function getDashboardCounts(): Promise<{
  stores: number;
  branches: number;
  users: number;
  activeSubscriptions: number;
}> {
  const [storesResult, branchesResult, usersResult, subscriptionsResult] = await Promise.all([
    supabase.from('stores').select('id', { count: 'exact', head: true }),
    supabase.from('branches').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }).not('store_id', 'is', null),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
  ]);

  return {
    stores: storesResult.count || 0,
    branches: branchesResult.count || 0,
    users: usersResult.count || 0,
    activeSubscriptions: subscriptionsResult.count || 0,
  };
}
