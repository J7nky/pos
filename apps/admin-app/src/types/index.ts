// Admin App Types
// Comprehensive type definitions for store management

// ============================================================================
// STORE TYPES
// ============================================================================

export interface Store {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  preferred_currency: 'USD' | 'LBP';
  preferred_language: 'en' | 'ar' | 'fr';
  preferred_commission_rate: number;
  exchange_rate: number;
  low_stock_alert: boolean;
  status: 'active' | 'suspended' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface StoreWithStats extends Store {
  branches_count: number;
  users_count: number;
  subscription?: Subscription;
}

export interface CreateStoreInput {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  preferred_currency?: 'USD' | 'LBP';
  preferred_language?: 'en' | 'ar' | 'fr';
  preferred_commission_rate?: number;
  exchange_rate?: number;
}

export interface UpdateStoreInput {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  preferred_currency?: 'USD' | 'LBP';
  preferred_language?: 'en' | 'ar' | 'fr';
  preferred_commission_rate?: number;
  exchange_rate?: number;
  low_stock_alert?: boolean;
  status?: 'active' | 'suspended' | 'archived';
}

// ============================================================================
// BRANCH TYPES
// ============================================================================

export interface Branch {
  id: string;
  store_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateBranchInput {
  store_id: string;
  name: string;
  address?: string;
  phone?: string;
}

export interface UpdateBranchInput {
  name?: string;
  address?: string;
  phone?: string;
  is_active?: boolean;
}

// ============================================================================
// USER TYPES (Store Users)
// ============================================================================

export type UserRole = 'admin' | 'manager' | 'cashier';

export interface StoreUser {
  id: string;
  store_id: string;
  branch_id: string | null;
  email: string;
  name: string;
  role: UserRole;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  store_id: string;
  branch_id?: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  password: string;
}

export interface UpdateUserInput {
  branch_id?: string | null;
  name?: string;
  role?: UserRole;
  phone?: string;
  is_active?: boolean;
}

// ============================================================================
// SUBSCRIPTION TYPES
// ============================================================================

export type SubscriptionTier = 'starter' | 'professional' | 'premium';
export type SubscriptionStatus = 'active' | 'trial' | 'expired' | 'suspended' | 'cancelled';
export type BillingCycle = 'monthly' | 'yearly';

export interface Subscription {
  id: string;
  store_id: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  current_period_start: string;
  current_period_end: string;
  trial_ends_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionUsage {
  branches_count: number;
  branches_limit: number;
  users_count: number;
  users_limit: number | null; // null = unlimited
  products_count: number;
  products_limit: number | null; // null = unlimited
}

export interface CreateSubscriptionInput {
  store_id: string;
  tier: SubscriptionTier;
  billing_cycle: BillingCycle;
}

export interface UpdateSubscriptionInput {
  tier?: SubscriptionTier;
  billing_cycle?: BillingCycle;
  status?: SubscriptionStatus;
}

// ============================================================================
// SUBSCRIPTION PLAN CONFIGURATION
// ============================================================================

export interface SubscriptionPlan {
  tier: SubscriptionTier;
  name: string;
  subtitle: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  yearlySavings: number;
  features: {
    branches: number;
    users: number | 'unlimited';
    products: number | 'unlimited';
    cloudSync: boolean;
    qrPrinting: boolean;
    notifications: boolean;
    multiDevice: boolean;
    apiAccess: boolean;
  };
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    tier: 'starter',
    name: 'Starter',
    subtitle: 'Offline Only',
    description: 'Perfect for very small stores',
    monthlyPrice: 20,
    yearlyPrice: 200,
    yearlySavings: 40,
    features: {
      branches: 1,
      users: 3,
      products: 250,
      cloudSync: false,
      qrPrinting: false,
      notifications: false,
      multiDevice: false,
      apiAccess: false,
    },
  },
  {
    tier: 'professional',
    name: 'Professional',
    subtitle: 'For growing stores',
    description: 'Everything in Starter +',
    monthlyPrice: 50,
    yearlyPrice: 500,
    yearlySavings: 100,
    features: {
      branches: 2,
      users: 10,
      products: 'unlimited',
      cloudSync: true,
      qrPrinting: true,
      notifications: true,
      multiDevice: true,
      apiAccess: false,
    },
  },
  {
    tier: 'premium',
    name: 'Premium',
    subtitle: 'For large wholesalers & chains',
    description: 'Everything in Pro +',
    monthlyPrice: 149,
    yearlyPrice: 1490,
    yearlySavings: 298,
    features: {
      branches: 5,
      users: 'unlimited',
      products: 'unlimited',
      cloudSync: true,
      qrPrinting: true,
      notifications: true,
      multiDevice: true,
      apiAccess: true,
    },
  },
];

export function getSubscriptionPlan(tier: SubscriptionTier): SubscriptionPlan {
  return SUBSCRIPTION_PLANS.find(p => p.tier === tier) || SUBSCRIPTION_PLANS[0];
}

export function getSubscriptionLimits(tier: SubscriptionTier) {
  const plan = getSubscriptionPlan(tier);
  return {
    branches: plan.features.branches,
    users: plan.features.users === 'unlimited' ? null : plan.features.users,
    products: plan.features.products === 'unlimited' ? null : plan.features.products,
  };
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// FILTER & SORT TYPES
// ============================================================================

export interface StoreFilters {
  search?: string;
  status?: Store['status'];
  subscriptionTier?: SubscriptionTier;
}

export interface BranchFilters {
  search?: string;
  isActive?: boolean;
}

export interface UserFilters {
  search?: string;
  role?: UserRole;
  branchId?: string;
  isActive?: boolean;
}

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: string;
  direction: SortDirection;
}
