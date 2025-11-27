// License Manager Utility
// Handles license file creation, import/export, and management

import { LicenseFile } from '../types/subscription';
import { SubscriptionTier } from '../config/subscriptionConfig';
import { LicenseValidationService } from '../services/licenseValidationService';
import { DeviceFingerprintGenerator } from './deviceFingerprint';

export class LicenseManager {
  private static instance: LicenseManager;
  private validationService: LicenseValidationService;
  private fingerprintGenerator: DeviceFingerprintGenerator;
  
  private constructor() {
    this.validationService = LicenseValidationService.getInstance();
    this.fingerprintGenerator = DeviceFingerprintGenerator.getInstance();
  }
  
  public static getInstance(): LicenseManager {
    if (!LicenseManager.instance) {
      LicenseManager.instance = new LicenseManager();
    }
    return LicenseManager.instance;
  }
  
  /**
   * Create a license file for a store
   * This would typically be done by an admin tool or server
   */
  public async createLicenseFile(options: {
    storeId: string;
    storeName: string;
    tier: SubscriptionTier;
    expiresAt: string;
    gracePeriodDays?: number;
    deviceFingerprint?: string;
    maxDevices?: number;
  }): Promise<LicenseFile> {
    const {
      storeId,
      storeName,
      tier,
      expiresAt,
      gracePeriodDays = 7,
      deviceFingerprint = '',
      maxDevices = 1
    } = options;
    
    // Get feature configuration for the tier
    const { SUBSCRIPTION_LIMITS } = await import('../config/subscriptionConfig');
    const limits = SUBSCRIPTION_LIMITS[tier];
    
    const enabledFeatures = Object.entries(limits.features)
      .filter(([_, enabled]) => enabled === true)
      .map(([feature, _]) => feature);
      
    const disabledFeatures = Object.entries(limits.features)
      .filter(([_, enabled]) => enabled === false)
      .map(([feature, _]) => feature);
    
    const licenseFile: LicenseFile = {
      version: '1.0',
      issued_at: new Date().toISOString(),
      issued_by: 'ProducePOS License Server',
      
      store_id: storeId,
      store_name: storeName,
      
      tier,
      expires_at: expiresAt,
      grace_period_days: gracePeriodDays,
      
      device_fingerprint: deviceFingerprint,
      max_devices: maxDevices,
      
      enabled_features: enabledFeatures,
      disabled_features: disabledFeatures,
      
      branch_limit: limits.branches,
      user_limit: limits.users,
      product_limit: limits.products,
      
      signature: '', // Will be generated
      checksum: ''   // Will be generated
    };
    
    // Generate signature and checksum
    licenseFile.signature = await this.generateSignature(licenseFile);
    licenseFile.checksum = await this.generateChecksum(licenseFile);
    
    return licenseFile;
  }
  
  /**
   * Export license file as JSON
   */
  public exportLicenseFile(licenseFile: LicenseFile): string {
    return JSON.stringify(licenseFile, null, 2);
  }
  
  /**
   * Import license file from JSON
   */
  public importLicenseFile(licenseJson: string): LicenseFile {
    try {
      const licenseFile = JSON.parse(licenseJson) as LicenseFile;
      
      // Validate required fields
      if (!licenseFile.store_id || !licenseFile.tier || !licenseFile.expires_at) {
        throw new Error('Invalid license file: missing required fields');
      }
      
      return licenseFile;
    } catch (error) {
      throw new Error(`Failed to import license file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Install license file for a store
   */
  public async installLicense(licenseFile: LicenseFile, storeId: string): Promise<{ success: boolean; message: string }> {
    return await this.validationService.installLicense(licenseFile, storeId);
  }
  
  /**
   * Generate a trial license for a store
   */
  public async generateTrialLicense(storeId: string, storeName: string, durationDays: number = 30): Promise<LicenseFile> {
    const fingerprint = await this.fingerprintGenerator.generateFingerprint();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);
    
    return await this.createLicenseFile({
      storeId,
      storeName,
      tier: 'professional', // Give full features for trial
      expiresAt: expiresAt.toISOString(),
      gracePeriodDays: 7,
      deviceFingerprint: fingerprint.fingerprint_hash,
      maxDevices: 1
    });
  }
  
  /**
   * Check if a license file is valid for the current device
   */
  public async validateLicenseForDevice(licenseFile: LicenseFile): Promise<{
    isValid: boolean;
    message: string;
    deviceMatch: boolean;
    expired: boolean;
  }> {
    const now = new Date();
    const expiresAt = new Date(licenseFile.expires_at);
    const expired = now > expiresAt;
    
    let deviceMatch = true;
    if (licenseFile.device_fingerprint) {
      const verification = await this.fingerprintGenerator.verifyFingerprint(licenseFile.device_fingerprint);
      deviceMatch = verification.matches || verification.similarity > 0.8;
    }
    
    const isValid = !expired && deviceMatch && this.verifySignature(licenseFile);
    
    let message = 'License is valid';
    if (expired) message = 'License has expired';
    else if (!deviceMatch) message = 'License is bound to a different device';
    else if (!this.verifySignature(licenseFile)) message = 'License signature is invalid';
    
    return {
      isValid,
      message,
      deviceMatch,
      expired
    };
  }
  
  /**
   * Get license information for display
   */
  public getLicenseInfo(licenseFile: LicenseFile): {
    storeName: string;
    tier: string;
    expiresAt: string;
    daysRemaining: number;
    features: string[];
    limits: {
      branches: number;
      users: number;
      products: number;
    };
  } {
    const now = new Date();
    const expiresAt = new Date(licenseFile.expires_at);
    const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    
    return {
      storeName: licenseFile.store_name,
      tier: licenseFile.tier.charAt(0).toUpperCase() + licenseFile.tier.slice(1),
      expiresAt: licenseFile.expires_at,
      daysRemaining,
      features: licenseFile.enabled_features,
      limits: {
        branches: licenseFile.branch_limit,
        users: licenseFile.user_limit,
        products: licenseFile.product_limit
      }
    };
  }
  
  /**
   * Generate signature for license file (simplified version)
   */
  private async generateSignature(licenseFile: Omit<LicenseFile, 'signature' | 'checksum'>): Promise<string> {
    // In a real implementation, this would use proper cryptographic signing
    const data = JSON.stringify({
      store_id: licenseFile.store_id,
      tier: licenseFile.tier,
      expires_at: licenseFile.expires_at,
      device_fingerprint: licenseFile.device_fingerprint
    });
    
    // Simple hash-based signature (replace with proper signing in production)
    if (crypto && crypto.subtle) {
      try {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (error) {
        console.warn('Web Crypto API not available, using fallback signature');
      }
    }
    
    // Fallback signature
    return btoa(data).slice(0, 32);
  }
  
  /**
   * Generate checksum for license file
   */
  private async generateChecksum(licenseFile: Omit<LicenseFile, 'checksum'>): Promise<string> {
    const data = JSON.stringify(licenseFile);
    
    if (crypto && crypto.subtle) {
      try {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
      } catch (error) {
        console.warn('Web Crypto API not available, using fallback checksum');
      }
    }
    
    // Fallback checksum
    return btoa(data).slice(-16);
  }
  
  /**
   * Verify license signature (simplified version)
   */
  private verifySignature(licenseFile: LicenseFile): boolean {
    // In a real implementation, this would verify cryptographic signatures
    // For now, just check if signature exists and is not empty
    return Boolean(licenseFile.signature && licenseFile.signature.length > 0);
  }
}
