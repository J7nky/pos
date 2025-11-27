// Subscription Types for Offline Tracking
// Handles local subscription validation and license management

import { SubscriptionTier } from '../config/subscriptionConfig';

export interface LocalSubscription {
  id: string;
  store_id: string;
  tier: SubscriptionTier;
  status: 'active' | 'expired' | 'suspended' | 'trial';
  
  // License information
  license_key: string;
  device_fingerprint: string;
  
  // Dates
  activated_at: string;
  expires_at: string;
  last_validated_at: string;
  
  // Grace period
  grace_period_days: number;
  grace_period_expires_at: string | null;
  
  // Validation tracking
  validation_attempts: number;
  last_validation_error: string | null;
  
  // Sync tracking
  _synced: boolean;
  _lastSyncedAt?: string;
  created_at: string;
  updated_at: string;
}

export interface LicenseValidation {
  id: string;
  store_id: string;
  subscription_id: string;
  
  // Validation details
  validation_type: 'startup' | 'periodic' | 'feature_check' | 'manual';
  validation_result: 'valid' | 'expired' | 'grace_period' | 'invalid' | 'tampered' | 'device_mismatch';
  validation_message: string | null;
  
  // System info at validation
  device_fingerprint: string;
  system_time: string;
  app_version: string;
  
  created_at: string;
}

export interface DeviceFingerprint {
  // Hardware identifiers
  cpu_cores: number;
  total_memory: number;
  screen_resolution: string;
  timezone: string;
  
  // Browser/system identifiers
  user_agent: string;
  platform: string;
  language: string;
  
  // Derived fingerprint
  fingerprint_hash: string;
  created_at: string;
}

export interface LicenseFile {
  // License metadata
  version: string;
  issued_at: string;
  issued_by: string;
  
  // Store information
  store_id: string;
  store_name: string;
  
  // Subscription details
  tier: SubscriptionTier;
  expires_at: string;
  grace_period_days: number;
  
  // Device binding
  device_fingerprint: string;
  max_devices: number;
  
  // Features
  enabled_features: string[];
  disabled_features: string[];
  
  // Limits
  branch_limit: number;
  user_limit: number;
  product_limit: number;
  
  // Security
  signature: string;
  checksum: string;
}

export interface SubscriptionUsage {
  id: string;
  store_id: string;
  subscription_id: string;
  
  // Current usage
  branches_count: number;
  users_count: number;
  products_count: number;
  customers_count: number;
  suppliers_count: number;
  
  // Usage tracking
  last_calculated_at: string;
  created_at: string;
  updated_at: string;
}

export interface OfflineSubscriptionConfig {
  // Grace period settings
  default_grace_period_days: number;
  max_grace_period_days: number;
  
  // Validation settings
  validation_interval_hours: number;
  max_validation_failures: number;
  
  // Security settings
  require_device_binding: boolean;
  allow_clock_drift_minutes: number;
  
  // Feature degradation
  features_disabled_on_expiry: string[];
  features_disabled_on_grace: string[];
}
