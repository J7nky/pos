// Subscription Service - Admin App
// Handles subscription management via Supabase

import { supabase } from '../lib/supabase';
import {
  Subscription,
  SubscriptionUsage,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  SubscriptionTier,
  getSubscriptionLimits,
} from '../types';

// ============================================================================
// SUBSCRIPTION CRUD OPERATIONS
// ============================================================================

/**
 * Get subscription for a store
 * Note: Returns null if subscriptions table doesn't exist yet
 */
export async function getSubscription(storeId: string): Promise<Subscription | null> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('store_id', storeId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      // Table might not exist
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        return null;
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
  const periodEnd = new Date();
  
  // Set period end based on billing cycle
  if (input.billing_cycle === 'yearly') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  const subscriptionData = {
    store_id: input.store_id,
    tier: input.tier,
    status: 'active' as const,
    billing_cycle: input.billing_cycle,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    trial_ends_at: null,
    cancelled_at: null,
  };

  const { data, error } = await supabase
    .from('subscriptions')
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
 * Note: Silently fails if subscriptions table doesn't exist yet
 */
export async function createTrialSubscription(
  storeId: string,
  tier: SubscriptionTier = 'professional',
  trialDays: number = 14
): Promise<Subscription | null> {
  try {
    const now = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trialDays);

    const subscriptionData = {
      store_id: storeId,
      tier,
      status: 'trial' as const,
      billing_cycle: 'monthly' as const,
      current_period_start: now.toISOString(),
      current_period_end: trialEnd.toISOString(),
      trial_ends_at: trialEnd.toISOString(),
      cancelled_at: null,
    };

    const { data, error } = await supabase
      .from('subscriptions')
      .insert(subscriptionData)
      .select()
      .single();

    if (error) {
      // Table might not exist yet - that's OK
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        console.log('Subscriptions table not available yet');
        return null;
      }
      console.error('Error creating trial subscription:', error);
      return null;
    }

    return data;
  } catch (e) {
    console.log('Failed to create trial subscription - table may not exist');
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
    .from('subscriptions')
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
 * Upgrade or downgrade subscription tier
 */
export async function changeTier(
  storeId: string,
  newTier: SubscriptionTier
): Promise<Subscription> {
  // Check if downgrade is possible (usage within limits)
  const usage = await getSubscriptionUsage(storeId);
  const newLimits = getSubscriptionLimits(newTier);

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

  return updateSubscription(storeId, { tier: newTier });
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(storeId: string): Promise<Subscription> {
  return updateSubscription(storeId, {
    status: 'cancelled',
  });
}

/**
 * Suspend a subscription
 */
export async function suspendSubscription(storeId: string): Promise<Subscription> {
  return updateSubscription(storeId, {
    status: 'suspended',
  });
}

/**
 * Reactivate a subscription
 */
export async function reactivateSubscription(storeId: string): Promise<Subscription> {
  const now = new Date();
  const periodEnd = new Date();
  
  // Get current subscription to determine billing cycle
  const current = await getSubscription(storeId);
  
  if (current?.billing_cycle === 'yearly') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .update({
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancelled_at: null,
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
  // Get subscription tier
  const subscription = await getSubscription(storeId);
  const tier: SubscriptionTier = subscription?.tier || 'starter';
  const limits = getSubscriptionLimits(tier);

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
  const tier: SubscriptionTier = subscription?.tier || 'starter';

  const featuresByTier: Record<SubscriptionTier, Record<string, boolean>> = {
    starter: {
      cloudSync: false,
      qrPrinting: false,
      notifications: false,
      multiDevice: false,
      apiAccess: false,
    },
    professional: {
      cloudSync: true,
      qrPrinting: true,
      notifications: true,
      multiDevice: true,
      apiAccess: false,
    },
    premium: {
      cloudSync: true,
      qrPrinting: true,
      notifications: true,
      multiDevice: true,
      apiAccess: true,
    },
  };

  return featuresByTier[tier][feature] || false;
}

// ============================================================================
// SUBSCRIPTION STATISTICS
// ============================================================================

/**
 * Get subscription statistics for dashboard
 * Note: Returns empty stats if subscriptions table doesn't exist yet
 */
export async function getSubscriptionStats(): Promise<{
  total: number;
  active: number;
  trial: number;
  expired: number;
  byTier: Record<SubscriptionTier, number>;
  monthlyRevenue: number;
}> {
  const emptyStats = {
    total: 0,
    active: 0,
    trial: 0,
    expired: 0,
    byTier: { starter: 0, professional: 0, premium: 0 },
    monthlyRevenue: 0,
  };

  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('status, tier, billing_cycle');

    if (error) {
      // Table might not exist yet
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        console.log('Subscriptions table not available yet');
        return emptyStats;
      }
      console.error('Error fetching subscription stats:', error);
      return emptyStats;
    }

    const subscriptions = data || [];

    // Calculate monthly revenue
    const pricing: Record<SubscriptionTier, { monthly: number; yearly: number }> = {
      starter: { monthly: 20, yearly: 200 },
      professional: { monthly: 50, yearly: 500 },
      premium: { monthly: 149, yearly: 1490 },
    };

    let monthlyRevenue = 0;
    subscriptions
      .filter((s: any) => s.status === 'active')
      .forEach((s: any) => {
        const price = pricing[s.tier as SubscriptionTier];
        if (s.billing_cycle === 'yearly') {
          monthlyRevenue += price.yearly / 12;
        } else {
          monthlyRevenue += price.monthly;
        }
      });

    return {
      total: subscriptions.length,
      active: subscriptions.filter((s: any) => s.status === 'active').length,
      trial: subscriptions.filter((s: any) => s.status === 'trial').length,
      expired: subscriptions.filter((s: any) => s.status === 'expired').length,
      byTier: {
        starter: subscriptions.filter((s: any) => s.tier === 'starter').length,
        professional: subscriptions.filter((s: any) => s.tier === 'professional').length,
        premium: subscriptions.filter((s: any) => s.tier === 'premium').length,
      },
      monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
    };
  } catch (e) {
    console.log('Subscriptions table not available yet');
    return emptyStats;
  }
}
