// User Service - Admin App
// Handles store user management via Supabase

import { supabase } from '../lib/supabase';
import {
  StoreUser,
  CreateUserInput,
  UpdateUserInput,
  UserFilters,
  getSubscriptionLimits,
  SubscriptionTier,
} from '../types';

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

  // Get subscription tier
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('tier')
    .eq('store_id', storeId)
    .single();

  const tier: SubscriptionTier = subscription?.tier || 'starter';
  const limits = getSubscriptionLimits(tier);
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

  // Check if email already exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', input.email)
    .single();

  if (existingUser) {
    throw new Error('A user with this email already exists');
  }

  // Create user in Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (authError) {
    console.error('Error creating auth user:', authError);
    throw new Error(`Failed to create user account: ${authError.message}`);
  }

  // Create user in users table
  const userData = {
    id: authData.user.id,
    store_id: input.store_id,
    branch_id: input.branch_id || null,
    email: input.email,
    name: input.name,
    role: input.role,
    phone: input.phone || null,
    is_active: true,
  };

  const { data, error } = await supabase
    .from('users')
    .insert(userData)
    .select()
    .single();

  if (error) {
    // Rollback: delete auth user if users table insert fails
    await supabase.auth.admin.deleteUser(authData.user.id);
    console.error('Error creating user:', error);
    throw new Error(`Failed to create user: ${error.message}`);
  }

  return data;
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

  // Delete from Supabase Auth
  const { error: authError } = await supabase.auth.admin.deleteUser(userId);

  if (authError) {
    console.error('Error deleting auth user:', authError);
    // Don't throw - user is already deleted from database
  }
}

/**
 * Reset user password
 */
export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) {
    console.error('Error resetting password:', error);
    throw new Error(`Failed to reset password: ${error.message}`);
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
