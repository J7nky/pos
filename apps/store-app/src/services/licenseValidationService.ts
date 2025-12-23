// License Validation Service
// Handles offline license validation and security checks

import { LocalSubscription, LicenseValidation, LicenseFile, OfflineSubscriptionConfig } from '../types/subscription';
import { DeviceFingerprintGenerator } from '../utils/deviceFingerprint';
import { getDB } from '../lib/db';

export interface ValidationResult {
  isValid: boolean;
  status: 'valid' | 'expired' | 'grace_period' | 'invalid' | 'tampered' | 'device_mismatch';
  message: string;
  expiresAt?: string;
  gracePeriodExpiresAt?: string;
  daysRemaining?: number;
}

export class LicenseValidationService {
  private static instance: LicenseValidationService;
  private fingerprintGenerator: DeviceFingerprintGenerator;
  
  private readonly config: OfflineSubscriptionConfig = {
    default_grace_period_days: 7,
    max_grace_period_days: 30,
    validation_interval_hours: 24,
    max_validation_failures: 5,
    require_device_binding: true,
    allow_clock_drift_minutes: 15,
    features_disabled_on_expiry: ['cloudSync', 'qrPrinting', 'notifications'],
    features_disabled_on_grace: ['apiAccess']
  };
  
  private constructor() {
    this.fingerprintGenerator = DeviceFingerprintGenerator.getInstance();
  }
  
  public static getInstance(): LicenseValidationService {
    if (!LicenseValidationService.instance) {
      LicenseValidationService.instance = new LicenseValidationService();
    }
    return LicenseValidationService.instance;
  }
  
  /**
   * Validate subscription for a store
   */
  public async validateSubscription(storeId: string): Promise<ValidationResult> {
    try {
      // Get current subscription
      const subscription = await this.getCurrentSubscription(storeId);
      if (!subscription) {
        return {
          isValid: false,
          status: 'invalid',
          message: 'No subscription found for this store'
        };
      }
      
      // Perform validation checks
      const deviceCheck = await this.validateDevice(subscription);
      if (!deviceCheck.isValid) {
        await this.recordValidation(storeId, subscription.id, 'startup', deviceCheck.status, deviceCheck.message);
        return deviceCheck;
      }
      
      const timeCheck = await this.validateTime(subscription);
      if (!timeCheck.isValid) {
        await this.recordValidation(storeId, subscription.id, 'startup', timeCheck.status, timeCheck.message);
        return timeCheck;
      }
      
      const expiryCheck = await this.validateExpiry(subscription);
      await this.recordValidation(storeId, subscription.id, 'startup', expiryCheck.status, expiryCheck.message);
      
      // Update last validation time
      await this.updateLastValidation(subscription.id);
      
      return expiryCheck;
      
    } catch (error) {
      console.error('License validation error:', error);
      return {
        isValid: false,
        status: 'invalid',
        message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
  
  /**
   * Validate device fingerprint
   */
  private async validateDevice(subscription: LocalSubscription): Promise<ValidationResult> {
    if (!this.config.require_device_binding) {
      return { isValid: true, status: 'valid', message: 'Device binding disabled' };
    }
    
    const verification = await this.fingerprintGenerator.verifyFingerprint(subscription.device_fingerprint);
    
    if (verification.matches) {
      return { isValid: true, status: 'valid', message: 'Device fingerprint matches' };
    }
    
    // Allow some tolerance for minor changes
    if (verification.similarity > 0.8) {
      console.warn('Device fingerprint similarity below threshold but within tolerance:', verification.similarity);
      return { isValid: true, status: 'valid', message: 'Device fingerprint similar (within tolerance)' };
    }
    
    return {
      isValid: false,
      status: 'device_mismatch',
      message: `Device fingerprint mismatch (similarity: ${Math.round(verification.similarity * 100)}%)`
    };
  }
  
  /**
   * Validate system time (detect clock manipulation)
   */
  private async validateTime(subscription: LocalSubscription): Promise<ValidationResult> {
    const now = new Date();
    const lastValidated = new Date(subscription.last_validated_at);
    
    // Check if system time went backwards significantly
    const timeDiff = now.getTime() - lastValidated.getTime();
    const allowedDriftMs = this.config.allow_clock_drift_minutes * 60 * 1000;
    
    if (timeDiff < -allowedDriftMs) {
      return {
        isValid: false,
        status: 'tampered',
        message: 'System clock appears to have been manipulated'
      };
    }
    
    return { isValid: true, status: 'valid', message: 'System time validation passed' };
  }
  
  /**
   * Validate subscription expiry and grace period
   */
  private async validateExpiry(subscription: LocalSubscription): Promise<ValidationResult> {
    const now = new Date();
    const expiresAt = new Date(subscription.expires_at);
    const gracePeriodExpiresAt = subscription.grace_period_expires_at ? 
      new Date(subscription.grace_period_expires_at) : null;
    
    // Calculate days remaining
    const msRemaining = expiresAt.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
    
    // Check if subscription is still valid
    if (now < expiresAt) {
      return {
        isValid: true,
        status: 'valid',
        message: 'Subscription is active',
        expiresAt: subscription.expires_at,
        daysRemaining: Math.max(0, daysRemaining)
      };
    }
    
    // Check grace period
    if (gracePeriodExpiresAt && now < gracePeriodExpiresAt) {
      const graceDaysRemaining = Math.ceil((gracePeriodExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return {
        isValid: true,
        status: 'grace_period',
        message: `Subscription expired, in grace period (${graceDaysRemaining} days remaining)`,
        expiresAt: subscription.expires_at,
        gracePeriodExpiresAt: subscription.grace_period_expires_at!,
        daysRemaining: Math.max(0, graceDaysRemaining)
      };
    }
    
    return {
      isValid: false,
      status: 'expired',
      message: 'Subscription has expired',
      expiresAt: subscription.expires_at,
      daysRemaining: 0
    };
  }
  
  /**
   * Get current subscription for store
   */
  private async getCurrentSubscription(storeId: string): Promise<LocalSubscription | null> {
    return await getDB().subscriptions
      .where('store_id')
      .equals(storeId)
      .and(sub => sub.status === 'active' || sub.status === 'trial')
      .first() || null;
  }
  
  /**
   * Record validation attempt
   */
  private async recordValidation(
    storeId: string, 
    subscriptionId: string, 
    type: LicenseValidation['validation_type'],
    result: LicenseValidation['validation_result'],
    message: string
  ): Promise<void> {
    const fingerprint = await this.fingerprintGenerator.generateFingerprint();
    
    const validation: Omit<LicenseValidation, 'id'> = {
      store_id: storeId,
      subscription_id: subscriptionId,
      validation_type: type,
      validation_result: result,
      validation_message: message,
      device_fingerprint: fingerprint.fingerprint_hash,
      system_time: new Date().toISOString(),
      app_version: '1.0.0', // TODO: Get from package.json
      created_at: new Date().toISOString()
    };
    
    await getDB().license_validations.add({
      id: crypto.randomUUID(),
      ...validation
    });
  }
  
  /**
   * Update last validation timestamp
   */
  private async updateLastValidation(subscriptionId: string): Promise<void> {
    await getDB().subscriptions.update(subscriptionId, {
      last_validated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  
  /**
   * Install license from license file
   */
  public async installLicense(licenseFile: LicenseFile, storeId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Validate license file
      const validation = await this.validateLicenseFile(licenseFile);
      if (!validation.isValid) {
        return { success: false, message: validation.message };
      }
      
      // Check if license is for this store
      if (licenseFile.store_id !== storeId) {
        return { success: false, message: 'License is not valid for this store' };
      }
      
      // Generate device fingerprint
      const fingerprint = await this.fingerprintGenerator.generateFingerprint();
      
      // Check device binding
      if (licenseFile.device_fingerprint && licenseFile.device_fingerprint !== fingerprint.fingerprint_hash) {
        return { success: false, message: 'License is bound to a different device' };
      }
      
      // Calculate grace period expiry
      const expiresAt = new Date(licenseFile.expires_at);
      const gracePeriodExpiresAt = new Date(expiresAt.getTime() + (licenseFile.grace_period_days * 24 * 60 * 60 * 1000));
      
      // Create subscription record
      const subscription: Omit<LocalSubscription, 'id'> = {
        store_id: storeId,
        tier: licenseFile.tier,
        status: 'active',
        license_key: this.generateLicenseKey(),
        device_fingerprint: fingerprint.fingerprint_hash,
        activated_at: new Date().toISOString(),
        expires_at: licenseFile.expires_at,
        last_validated_at: new Date().toISOString(),
        grace_period_days: licenseFile.grace_period_days,
        grace_period_expires_at: gracePeriodExpiresAt.toISOString(),
        validation_attempts: 0,
        last_validation_error: null,
        _synced: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // Deactivate existing subscriptions
      await getDB().subscriptions
        .where('store_id')
        .equals(storeId)
        .modify({ status: 'suspended' });
      
      // Add new subscription
      await getDB().subscriptions.add({
        id: crypto.randomUUID(),
        ...subscription
      });
      
      return { success: true, message: 'License installed successfully' };
      
    } catch (error) {
      console.error('License installation error:', error);
      return { 
        success: false, 
        message: `Installation failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
  
  /**
   * Validate license file integrity
   */
  private async validateLicenseFile(licenseFile: LicenseFile): Promise<{ isValid: boolean; message: string }> {
    // Check required fields
    if (!licenseFile.store_id || !licenseFile.tier || !licenseFile.expires_at) {
      return { isValid: false, message: 'License file is missing required fields' };
    }
    
    // Check expiry
    const expiresAt = new Date(licenseFile.expires_at);
    if (expiresAt < new Date()) {
      return { isValid: false, message: 'License has expired' };
    }
    
    // TODO: Implement signature verification
    // For now, just check if signature exists
    if (!licenseFile.signature) {
      return { isValid: false, message: 'License file is not signed' };
    }
    
    return { isValid: true, message: 'License file is valid' };
  }
  
  /**
   * Generate a license key
   */
  private generateLicenseKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segments = [];
    
    for (let i = 0; i < 4; i++) {
      let segment = '';
      for (let j = 0; j < 4; j++) {
        segment += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      segments.push(segment);
    }
    
    return segments.join('-');
  }
  
  /**
   * Get subscription status summary
   */
  public async getSubscriptionStatus(storeId: string): Promise<{
    hasSubscription: boolean;
    isValid: boolean;
    tier?: string;
    status?: string;
    expiresAt?: string;
    daysRemaining?: number;
    validationResult?: ValidationResult;
  }> {
    const subscription = await this.getCurrentSubscription(storeId);
    
    if (!subscription) {
      return { hasSubscription: false, isValid: false };
    }
    
    const validation = await this.validateSubscription(storeId);
    
    return {
      hasSubscription: true,
      isValid: validation.isValid,
      tier: subscription.tier,
      status: subscription.status,
      expiresAt: subscription.expires_at,
      daysRemaining: validation.daysRemaining,
      validationResult: validation
    };
  }
}
