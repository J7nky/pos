// Subscription License Service
// Handles feature gating and subscription validation with offline support

import { SUBSCRIPTION_LIMITS, type SubscriptionTier, type SubscriptionLimits } from '../config/subscriptionConfig';
import { LicenseValidationService } from './licenseValidationService';

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  isActive: boolean;
  expiresAt: Date | null;
  limits: SubscriptionLimits;
  validationResult?: any;
}

export class SubscriptionLicenseService {
  private static instance: SubscriptionLicenseService;
  private licenseValidator: LicenseValidationService;
  
  private constructor() {
    this.licenseValidator = LicenseValidationService.getInstance();
  }
  
  public static getInstance(): SubscriptionLicenseService {
    if (!SubscriptionLicenseService.instance) {
      SubscriptionLicenseService.instance = new SubscriptionLicenseService();
    }
    return SubscriptionLicenseService.instance;
  }
  
  /**
   * Get current subscription status for a store with offline validation
   */
  public async getSubscriptionStatus(storeId: string): Promise<SubscriptionStatus> {
    try {
      // Get subscription status from offline license validator
      const status = await this.licenseValidator.getSubscriptionStatus(storeId);
      
      if (!status.hasSubscription) {
        // No subscription found, return default starter tier (trial mode)
        return {
          tier: 'starter',
          isActive: false,
          expiresAt: null,
          limits: SUBSCRIPTION_LIMITS.starter
        };
      }
      
      return {
        tier: status.tier as SubscriptionTier,
        isActive: status.isValid,
        expiresAt: status.expiresAt ? new Date(status.expiresAt) : null,
        limits: SUBSCRIPTION_LIMITS[status.tier as SubscriptionTier],
        validationResult: status.validationResult
      };
      
    } catch (error) {
      console.error('Error getting subscription status:', error);
      // Fallback to starter tier on error
      return {
        tier: 'starter',
        isActive: false,
        expiresAt: null,
        limits: SUBSCRIPTION_LIMITS.starter
      };
    }
  }
  
  /**
   * Check if a specific feature is enabled for the current subscription
   */
  public async isFeatureEnabled(storeId: string, feature: keyof SubscriptionLimits['features']): Promise<boolean> {
    const status = await this.getSubscriptionStatus(storeId);
    
    if (!status.isActive) {
      return false;
    }
    
    return status.limits.features[feature];
  }
  
  /**
   * Check if current usage is within subscription limits
   */
  public async isWithinLimit(
    storeId: string, 
    limitType: keyof Pick<SubscriptionLimits, 'branches' | 'users' | 'products' | 'customers' | 'suppliers'>,
    currentCount: number
  ): Promise<boolean> {
    const status = await this.getSubscriptionStatus(storeId);
    
    if (!status.isActive) {
      return false;
    }
    
    const limit = status.limits[limitType];
    
    // -1 means unlimited
    if (limit === -1) {
      return true;
    }
    
    return currentCount < limit;
  }
  
  /**
   * Get the maximum allowed count for a specific limit
   */
  public async getLimit(
    storeId: string,
    limitType: keyof Pick<SubscriptionLimits, 'branches' | 'users' | 'products' | 'customers' | 'suppliers'>
  ): Promise<number> {
    const status = await this.getSubscriptionStatus(storeId);
    return status.limits[limitType];
  }
  
  /**
   * Get pricing information for the current subscription
   */
  public async getPricing(storeId: string): Promise<{ monthly: number; yearly: number }> {
    const status = await this.getSubscriptionStatus(storeId);
    return status.limits.pricing;
  }
  
  /**
   * Check if QR printing is available (Starter plan restriction)
   */
  public async canPrintQRCodes(storeId: string): Promise<boolean> {
    return this.isFeatureEnabled(storeId, 'qrPrinting');
  }
  
  /**
   * Check if notifications are available (Starter plan restriction)
   */
  public async canUseNotifications(storeId: string): Promise<boolean> {
    return this.isFeatureEnabled(storeId, 'notifications');
  }
  
  /**
   * Check if cloud sync is available (Starter plan is offline-only)
   */
  public async canUseCloudSync(storeId: string): Promise<boolean> {
    return this.isFeatureEnabled(storeId, 'cloudSync');
  }
  
  /**
   * Check if multi-device access is available
   */
  public async canUseMultiDevice(storeId: string): Promise<boolean> {
    return this.isFeatureEnabled(storeId, 'multiDevice');
  }
  
  /**
   * Get all subscription tiers with their features for comparison
   */
  public getAllTiers(): Record<SubscriptionTier, SubscriptionLimits> {
    return SUBSCRIPTION_LIMITS;
  }
  
  /**
   * Get feature comparison between tiers
   */
  public getFeatureComparison(): {
    feature: string;
    starter: boolean;
    professional: boolean;
    premium: boolean;
  }[] {
    const features = Object.keys(SUBSCRIPTION_LIMITS.starter.features) as Array<keyof SubscriptionLimits['features']>;
    
    return features.map(feature => ({
      feature: feature.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
      starter: SUBSCRIPTION_LIMITS.starter.features[feature],
      professional: SUBSCRIPTION_LIMITS.professional.features[feature],
      premium: SUBSCRIPTION_LIMITS.premium.features[feature],
    }));
  }
  
  /**
   * Calculate yearly savings for each tier
   */
  public getYearlySavings(tier: SubscriptionTier): number {
    const limits = SUBSCRIPTION_LIMITS[tier];
    const monthlyTotal = limits.pricing.monthly * 12;
    return monthlyTotal - limits.pricing.yearly;
  }
}
