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
  logo: string | null;
  preferred_currency: 'USD' | 'LBP';
  preferred_language: 'en' | 'ar' | 'fr';
  preferred_commission_rate: number;
  exchange_rate: number;
  low_stock_alert: boolean;
  status: 'active' | 'suspended' | 'archived';
  created_at: string;
  updated_at: string;
  // Soft-delete fields (industry standard - stores should NEVER be hard-deleted)
  is_deleted?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
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
  logo?: string | null;
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
  logo: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Soft-delete fields (industry standard - branches should NEVER be hard-deleted)
  is_deleted?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
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
  logo?: string | null;
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

// Maps to existing store_subscriptions table
export type SubscriptionPlan = 'starter' | 'professional' | 'premium';
export type SubscriptionStatus = 'active' | 'trial' | 'expired' | 'cancelled';
export type BillingCycle = 'monthly' | 'yearly';
export type Currency = 'USD' | 'LBP';

// Legacy alias for compatibility
export type SubscriptionTier = SubscriptionPlan;

export interface Subscription {
  id: string;
  store_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  start_date: string;
  end_date: string;
  amount: number;
  currency: Currency;
  allowed_branches: number;
  cancelled_at: string | null;
  cancellation_reason: string | null;
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
  plan: SubscriptionPlan;
  billing_cycle: BillingCycle;
  amount: number;
  currency: Currency;
  allowed_branches?: number;
}

export interface UpdateSubscriptionInput {
  plan?: SubscriptionPlan;
  billing_cycle?: BillingCycle;
  status?: SubscriptionStatus;
  amount?: number;
  allowed_branches?: number;
}

// ============================================================================
// SUBSCRIPTION PLAN CONFIGURATION
// ============================================================================

export interface SubscriptionPlanConfig {
  plan: SubscriptionPlan;
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

export const SUBSCRIPTION_PLAN_CONFIGS: SubscriptionPlanConfig[] = [
  {
    plan: 'starter',
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
    plan: 'professional',
    name: 'Professional',
    subtitle: 'For growing stores',
    description: 'Everything in Basic +',
    monthlyPrice: 50,
    yearlyPrice: 500,
    yearlySavings: 100,
    features: {
      branches: 3,
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
    plan: 'premium',
    name: 'Premium',
    subtitle: 'For large wholesalers & chains',
    description: 'Everything in Premium +',
    monthlyPrice: 149,
    yearlyPrice: 1490,
    yearlySavings: 298,
    features: {
      branches: 10,
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

export function getSubscriptionPlanConfig(plan: SubscriptionPlan): SubscriptionPlanConfig {
  return SUBSCRIPTION_PLAN_CONFIGS.find(p => p.plan === plan) || SUBSCRIPTION_PLAN_CONFIGS[0];
}

export function getSubscriptionLimits(plan: SubscriptionPlan) {
  const config = getSubscriptionPlanConfig(plan);
  return {
    branches: config.features.branches,
    users: config.features.users === 'unlimited' ? null : config.features.users,
    products: config.features.products === 'unlimited' ? null : config.features.products,
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
  subscriptionPlan?: SubscriptionPlan;
  includeDeleted?: boolean; // For admin recovery purposes
}

export interface BranchFilters {
  search?: string;
  isActive?: boolean;
  includeDeleted?: boolean; // For admin recovery purposes
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
