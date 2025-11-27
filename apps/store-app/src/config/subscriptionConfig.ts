// Subscription Configuration
// Manages subscription tiers and feature gating

export type SubscriptionTier = 'starter' | 'professional' | 'premium';

export interface SubscriptionPricing {
  monthly: number;
  yearly: number;
}

export interface SubscriptionLimits {
  tier: SubscriptionTier;
  
  // Pricing information
  pricing: SubscriptionPricing;
  
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
    qrPrinting: boolean;
    notifications: boolean;
    multiDevice: boolean;
    localBackupsOnly: boolean;
  };
}

export const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, SubscriptionLimits> = {
  starter: {
    tier: 'starter',
    pricing: {
      monthly: 20,
      yearly: 200, // $200/year (saves $40)
    },
    branches: 1,
    users: 3, // 1 admin, 1 cashier, 1 manager
    products: 250,
    customers: -1, // Unlimited
    suppliers: -1, // Unlimited
    monthlyTransactions: -1, // Unlimited
    dataRetentionDays: -1, // Unlimited (local storage)
    cashDrawerAccounts: 1,
    features: {
      cloudSync: false, // 🔒 Offline only
      multiCurrency: true, // All features available except restricted ones
      advancedAccounting: true,
      employeeAttendance: true,
      auditLogs: true,
      reminders: true,
      apiAccess: false,
      customReports: true,
      multiBranch: false,
      multiLanguage: true,
      qrPrinting: false, // 🔒 No QR printing
      notifications: false, // 🔒 No notifications
      multiDevice: false, // 🔒 No multi-device
      localBackupsOnly: true, // 🔒 Local backups only
    },
  },
  
  professional: {
    tier: 'professional',
    pricing: {
      monthly: 50,
      yearly: 500, // $500/year (saves $100)
    },
    branches: 2,
    users: 10,
    products: -1, // Unlimited
    customers: -1, // Unlimited
    suppliers: -1, // Unlimited
    monthlyTransactions: -1, // Unlimited
    dataRetentionDays: -1, // Unlimited
    cashDrawerAccounts: 2,
    features: {
      cloudSync: true, // ✅ Real-time cloud sync
      multiCurrency: true,
      advancedAccounting: true,
      employeeAttendance: true,
      auditLogs: true,
      reminders: true,
      apiAccess: false,
      customReports: true,
      multiBranch: true,
      multiLanguage: true,
      qrPrinting: true, // ✅ QR printing enabled
      notifications: true, // ✅ Notifications enabled
      multiDevice: true, // ✅ Multi-device access
      localBackupsOnly: false, // ✅ Cloud backups
    },
  },
  
  premium: {
    tier: 'premium',
    pricing: {
      monthly: 149,
      yearly: 1490, // No yearly discount mentioned, so 10x monthly
    },
    branches: 5,
    users: -1, // Unlimited users
    products: -1, // Unlimited
    customers: -1, // Unlimited
    suppliers: -1, // Unlimited
    monthlyTransactions: -1, // Unlimited
    dataRetentionDays: -1, // Unlimited
    cashDrawerAccounts: 5,
    features: {
      cloudSync: true,
      multiCurrency: true,
      advancedAccounting: true,
      employeeAttendance: true,
      auditLogs: true,
      reminders: true,
      apiAccess: true, // ✅ API access for enterprise integrations
      customReports: true,
      multiBranch: true,
      multiLanguage: true,
      qrPrinting: true,
      notifications: true,
      multiDevice: true,
      localBackupsOnly: false,
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
