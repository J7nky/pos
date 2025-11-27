// Subscription Configuration
// Manages subscription tiers and feature gating

export type SubscriptionTier = 'starter' | 'professional' | 'enterprise';

export interface SubscriptionLimits {
  tier: SubscriptionTier;
  
  // Operational limits
  branches: number;
  users: number;
  products: number;
  customers: number;
  suppliers: number;
  monthlyTransactions: number;
  dataRetentionDays: number;
  cashDrawerAccounts: number;
  
  // Feature flags
  features: {
    cloudSync: boolean;
    multiCurrency: boolean;
    advancedAccounting: boolean;
    employeeAttendance: boolean;
    auditLogs: boolean;
    reminders: boolean;
    apiAccess: boolean;
    customReports: boolean;
    multiBranch: boolean;
    multiLanguage: boolean;
  };
}

export const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, SubscriptionLimits> = {
  starter: {
    tier: 'starter',
    branches: 1,
    users: 3,
    products: 100,
    customers: 50,
    suppliers: 20,
    monthlyTransactions: 500,
    dataRetentionDays: 30,
    cashDrawerAccounts: 1,
    features: {
      cloudSync: false, // 🔒 KEY DIFFERENCE - No cloud sync
      multiCurrency: false,
      advancedAccounting: false,
      employeeAttendance: false,
      auditLogs: false,
      reminders: false,
      apiAccess: false,
      customReports: false,
      multiBranch: false,
      multiLanguage: false,
    },
  },
  
  professional: {
    tier: 'professional',
    branches: 3,
    users: 8,
    products: 500,
    customers: 200,
    suppliers: 50,
    monthlyTransactions: 2500,
    dataRetentionDays: 90,
    cashDrawerAccounts: 3,
    features: {
      cloudSync: true, // ✅ Cloud sync enabled
      multiCurrency: true,
      advancedAccounting: true,
      employeeAttendance: true,
      auditLogs: true,
      reminders: true,
      apiAccess: false,
      customReports: false,
      multiBranch: true,
      multiLanguage: true,
    },
  },
  
  enterprise: {
    tier: 'enterprise',
    branches: -1, // Unlimited
    users: -1, // Unlimited
    products: -1, // Unlimited
    customers: -1, // Unlimited
    suppliers: -1, // Unlimited
    monthlyTransactions: -1, // Unlimited
    dataRetentionDays: 365,
    cashDrawerAccounts: -1, // Unlimited
    features: {
      cloudSync: true,
      multiCurrency: true,
      advancedAccounting: true,
      employeeAttendance: true,
      auditLogs: true,
      reminders: true,
      apiAccess: true,
      customReports: true,
      multiBranch: true,
      multiLanguage: true,
    },
  },
};

// Helper to check if a limit is unlimited
export function isUnlimited(limit: number): boolean {
  return limit === -1;
}

// Helper to check if within limit
export function isWithinLimit(current: number, limit: number): boolean {
  if (isUnlimited(limit)) return true;
  return current < limit;
}
