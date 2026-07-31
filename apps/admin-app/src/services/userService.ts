// User Service - Admin App
// Handles store user management via Supabase

import { supabase } from '../lib/supabase';
import {
  StoreUser,
  CreateUserInput,
  UpdateUserInput,
  UserFilters,
  getSubscriptionLimits,
  SubscriptionPlan,
} from '../types';

/**
 * Invoke the admin-users Edge Function (server-side holder of the service
 * role key) and normalize its error shape. Non-2xx responses surface their
 * JSON `error` message.
 */
async function invokeAdminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = await (error as { context?: Response }).context?.json();
      if (ctx?.error) message = ctx.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }
  return data as T;
}

// ============================================================================
// USER CRUD OPERATIONS
// ============================================================================

/**
 * Get all users for a store
 */
export async function getUsers(storeId: string, filters?: UserFilters): Promise<StoreUser[]> {
  let query = supabase
    .from('users')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });

  if (filters?.role) {
    query = query.eq('role', filters.role);
  }

  if (filters?.branchId) {
    query = query.eq('branch_id', filters.branchId);
  }

  if (filters?.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }

  if (filters?.search) {
    query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching users:', error);
    throw new Error(`Failed to fetch users: ${error.message}`);
  }

  return data || [];
}

/**
 * Get a single user by ID
 */
export async function getUser(userId: string): Promise<StoreUser | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error fetching user:', error);
    throw new Error(`Failed to fetch user: ${error.message}`);
  }

  return data;
}

/**
 * Get user count for a store
 */
export async function getUserCount(storeId: string): Promise<number> {
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId);

  if (error) {
    console.error('Error counting users:', error);
    throw new Error(`Failed to count users: ${error.message}`);
  }

  return count || 0;
}

/**
 * Check if a store can add more users based on subscription
 */
export async function canCreateUser(storeId: string): Promise<{
  canCreate: boolean;
  currentCount: number;
  limit: number | null;
  message?: string;
}> {
  // Get current user count
  const currentCount = await getUserCount(storeId);

  // Get subscription plan
  const { data: subscription } = await supabase
    .from('store_subscriptions')
    .select('plan')
    .eq('store_id', storeId)
    .single();

  const plan: SubscriptionPlan = subscription?.plan || 'starter';
  const limits = getSubscriptionLimits(plan);
  const limit = limits.users;

  // null means unlimited
  if (limit === null) {
    return {
      canCreate: true,
      currentCount,
      limit: null,
    };
  }

  if (currentCount >= limit) {
    return {
      canCreate: false,
      currentCount,
      limit,
      message: `User limit reached (${currentCount}/${limit}). Upgrade your subscription to add more users.`,
    };
  }

  return {
    canCreate: true,
    currentCount,
    limit,
  };
}

/**
 * Create a new user for a store
 * Note: This creates the user in the users table and optionally in Supabase Auth
 */
export async function createUser(input: CreateUserInput): Promise<StoreUser> {
  // Check if can create
  const { canCreate, message } = await canCreateUser(input.store_id);
  
  if (!canCreate) {
    throw new Error(message || 'Cannot create user');
  }

  // The admin-users Edge Function performs the global email-uniqueness
  // check, creates the auth user + users row (rolling back the auth user on
  // failure), and creates the matching employee entity — all server-side,
  // so the service role key never ships in the client bundle.
  const result = await invokeAdminUsers<{ user: StoreUser; entity_created: boolean }>({
    action: 'create_user',
    email: input.email,
    password: input.password,
    name: input.name,
    role: input.role,
    store_id: input.store_id,
    branch_id: input.branch_id || null,
    phone: input.phone || null,
  });

  if (!result.entity_created) {
    console.warn('⚠️ User created but entity record creation failed. Entity can be created later.');
  }

  return result.user;
}

/**
 * Update a user
 */
export async function updateUser(userId: string, input: UpdateUserInput): Promise<StoreUser> {
  const { data, error } = await supabase
    .from('users')
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating user:', error);
    throw new Error(`Failed to update user: ${error.message}`);
  }

  return data;
}

/**
 * Deactivate a user (soft delete)
 */
export async function deactivateUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('Error deactivating user:', error);
    throw new Error(`Failed to deactivate user: ${error.message}`);
  }
}

/**
 * Reactivate a user
 */
export async function reactivateUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('Error reactivating user:', error);
    throw new Error(`Failed to reactivate user: ${error.message}`);
  }
}

/**
 * Delete a user permanently
 */
export async function deleteUser(userId: string): Promise<void> {
  // Delete from users table first
  const { error: dbError } = await supabase
    .from('users')
    .delete()
    .eq('id', userId);

  if (dbError) {
    console.error('Error deleting user from database:', dbError);
    throw new Error(`Failed to delete user: ${dbError.message}`);
  }

  // Delete from Supabase Auth (server-side via Edge Function)
  try {
    await invokeAdminUsers<{ deleted: boolean }>({
      action: 'delete_auth_user',
      user_id: userId,
    });
  } catch (authError) {
    console.error('Error deleting auth user:', authError);
    // Don't throw - user is already deleted from database
  }
}

/**
 * Reset user password
 */
export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  try {
    await invokeAdminUsers<{ reset: boolean }>({
      action: 'reset_password',
      user_id: userId,
      new_password: newPassword,
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    throw new Error(
      `Failed to reset password: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    console.error('Error sending password reset email:', error);
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
}

// ============================================================================
// USER STATISTICS
// ============================================================================

/**
 * Get user statistics for a store
 */
export async function getUserStats(storeId: string): Promise<{
  total: number;
  active: number;
  inactive: number;
  byRole: Record<string, number>;
}> {
  const users = await getUsers(storeId);
  
  return {
    total: users.length,
    active: users.filter(u => u.is_active).length,
    inactive: users.filter(u => !u.is_active).length,
    byRole: {
      admin: users.filter(u => u.role === 'admin').length,
      manager: users.filter(u => u.role === 'manager').length,
      cashier: users.filter(u => u.role === 'cashier').length,
    },
  };
}
