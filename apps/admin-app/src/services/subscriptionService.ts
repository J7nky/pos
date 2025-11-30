// Subscription Service - Admin App
// Handles subscription management via Supabase
// Uses existing store_subscriptions table

import { supabase } from '../lib/supabase';
import {
  Subscription,
  SubscriptionUsage,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  SubscriptionPlan,
  getSubscriptionLimits,
} from '../types';

// Table name in database
const TABLE_NAME = 'store_subscriptions';

// ============================================================================
// SUBSCRIPTION CRUD OPERATIONS
// ============================================================================

/**
 * Get subscription for a store
 */
export async function getSubscription(storeId: string): Promise<Subscription | null> {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('store_id', storeId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      console.error('Error fetching subscription:', error);
      return null;
    }

    return data;
  } catch (e) {
    return null;
  }
}

/**
 * Create a subscription for a store
 */
export async function createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
  const now = new Date();
  const endDate = new Date();
  
  // Set end date based on billing cycle
  if (input.billing_cycle === 'yearly') {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }

  const subscriptionData = {
    store_id: input.store_id,
    plan: input.plan,
    status: 'active',
    billing_cycle: input.billing_cycle,
    start_date: now.toISOString(),
    end_date: endDate.toISOString(),
    amount: input.amount,
    currency: input.currency,
    allowed_branches: input.allowed_branches || 1,
    cancelled_at: null,
    cancellation_reason: null,
  };

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert(subscriptionData)
    .select()
    .single();

  if (error) {
    console.error('Error creating subscription:', error);
    throw new Error(`Failed to create subscription: ${error.message}`);
  }

  return data;
}

/**
 * Create a trial subscription for a store
 */
export async function createTrialSubscription(
  storeId: string,
  plan: SubscriptionPlan = 'premium',
  trialDays: number = 14
): Promise<Subscription | null> {
  try {
    const now = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trialDays);

    // Get plan config for pricing
    const planPricing: Record<SubscriptionPlan, number> = {
      basic: 20,
      premium: 50,
      enterprise: 150,
    };

    const subscriptionData = {
      store_id: storeId,
      plan,
      status: 'trial',
      billing_cycle: 'monthly',
      start_date: now.toISOString(),
      end_date: trialEnd.toISOString(),
      amount: planPricing[plan],
      currency: 'USD',
      allowed_branches: plan === 'basic' ? 1 : plan === 'premium' ? 3 : 10,
      cancelled_at: null,
      cancellation_reason: null,
    };

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert(subscriptionData)
      .select()
      .single();

    if (error) {
      console.error('Error creating trial subscription:', error);
      return null;
    }

    return data;
  } catch (e) {
    console.log('Failed to create trial subscription');
    return null;
  }
}

/**
 * Update a subscription
 */
export async function updateSubscription(
  storeId: string,
  input: UpdateSubscriptionInput
): Promise<Subscription> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', storeId)
    .select()
    .single();

  if (error) {
    console.error('Error updating subscription:', error);
    throw new Error(`Failed to update subscription: ${error.message}`);
  }

  return data;
}

/**
 * Upgrade or downgrade subscription plan
 */
export async function changePlan(
  storeId: string,
  newPlan: SubscriptionPlan
): Promise<Subscription> {
  // Check if downgrade is possible (usage within limits)
  const usage = await getSubscriptionUsage(storeId);
  const newLimits = getSubscriptionLimits(newPlan);

  if (usage.branches_count > newLimits.branches) {
    throw new Error(
      `Cannot downgrade: Current branches (${usage.branches_count}) exceed new limit (${newLimits.branches}). ` +
      `Please deactivate some branches first.`
    );
  }

  if (newLimits.users !== null && usage.users_count > newLimits.users) {
    throw new Error(
      `Cannot downgrade: Current users (${usage.users_count}) exceed new limit (${newLimits.users}). ` +
      `Please deactivate some users first.`
    );
  }

  return updateSubscription(storeId, { plan: newPlan });
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(
  storeId: string,
  reason?: string
): Promise<Subscription> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', storeId)
    .select()
    .single();

  if (error) {
    console.error('Error cancelling subscription:', error);
    throw new Error(`Failed to cancel subscription: ${error.message}`);
  }

  return data;
}

/**
 * Reactivate a subscription
 */
export async function reactivateSubscription(storeId: string): Promise<Subscription> {
  const now = new Date();
  const endDate = new Date();
  
  // Get current subscription to determine billing cycle
  const current = await getSubscription(storeId);
  
  if (current?.billing_cycle === 'yearly') {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({
      status: 'active',
      start_date: now.toISOString(),
      end_date: endDate.toISOString(),
      cancelled_at: null,
      cancellation_reason: null,
      updated_at: now.toISOString(),
    })
    .eq('store_id', storeId)
    .select()
    .single();

  if (error) {
    console.error('Error reactivating subscription:', error);
    throw new Error(`Failed to reactivate subscription: ${error.message}`);
  }

  return data;
}

// ============================================================================
// SUBSCRIPTION USAGE
// ============================================================================

/**
 * Get subscription usage for a store
 */
export async function getSubscriptionUsage(storeId: string): Promise<SubscriptionUsage> {
  // Get subscription plan
  const subscription = await getSubscription(storeId);
  const plan: SubscriptionPlan = subscription?.plan || 'basic';
  const limits = getSubscriptionLimits(plan);

  // Get counts
  const [branchesResult, usersResult, productsResult] = await Promise.all([
    supabase
      .from('branches')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId),
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId),
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId),
  ]);

  return {
    branches_count: branchesResult.count || 0,
    branches_limit: limits.branches,
    users_count: usersResult.count || 0,
    users_limit: limits.users,
    products_count: productsResult.count || 0,
    products_limit: limits.products,
  };
}

/**
 * Check if a feature is available for a subscription
 */
export async function isFeatureAvailable(
  storeId: string,
  feature: 'cloudSync' | 'qrPrinting' | 'notifications' | 'multiDevice' | 'apiAccess'
): Promise<boolean> {
  const subscription = await getSubscription(storeId);
  const plan: SubscriptionPlan = subscription?.plan || 'basic';

  const featuresByPlan: Record<SubscriptionPlan, Record<string, boolean>> = {
    basic: {
      cloudSync: false,
      qrPrinting: false,
      notifications: false,
      multiDevice: false,
      apiAccess: false,
    },
    premium: {
      cloudSync: true,
      qrPrinting: true,
      notifications: true,
      multiDevice: true,
      apiAccess: false,
    },
    enterprise: {
      cloudSync: true,
      qrPrinting: true,
      notifications: true,
      multiDevice: true,
      apiAccess: true,
    },
  };

  return featuresByPlan[plan][feature] || false;
}

// ============================================================================
// SUBSCRIPTION STATISTICS
// ============================================================================

/**
 * Get subscription statistics for dashboard
 */
export async function getSubscriptionStats(): Promise<{
  total: number;
  active: number;
  trial: number;
  expired: number;
  byPlan: Record<SubscriptionPlan, number>;
  monthlyRevenue: number;
}> {
  const emptyStats = {
    total: 0,
    active: 0,
    trial: 0,
    expired: 0,
    byPlan: { basic: 0, premium: 0, enterprise: 0 },
    monthlyRevenue: 0,
  };

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('status, plan, billing_cycle, amount');

    if (error) {
      console.error('Error fetching subscription stats:', error);
      return emptyStats;
    }

    const subscriptions = data || [];

    // Calculate monthly revenue from actual amounts
    let monthlyRevenue = 0;
    subscriptions
      .filter((s: any) => s.status === 'active')
      .forEach((s: any) => {
        if (s.billing_cycle === 'yearly') {
          monthlyRevenue += (s.amount || 0) / 12;
        } else {
          monthlyRevenue += s.amount || 0;
        }
      });

    return {
      total: subscriptions.length,
      active: subscriptions.filter((s: any) => s.status === 'active').length,
      trial: subscriptions.filter((s: any) => s.status === 'trial').length,
      expired: subscriptions.filter((s: any) => s.status === 'expired').length,
      byPlan: {
        basic: subscriptions.filter((s: any) => s.plan === 'basic').length,
        premium: subscriptions.filter((s: any) => s.plan === 'premium').length,
        enterprise: subscriptions.filter((s: any) => s.plan === 'enterprise').length,
      },
      monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
    };
  } catch (e) {
    console.log('Error fetching subscription stats');
    return emptyStats;
  }
}
