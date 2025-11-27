// Offline Subscription Demo
// Demonstrates how the offline subscription tracking system works

import { LicenseManager } from './licenseManager';
import { LicenseValidationService } from '../services/licenseValidationService';
import { SubscriptionLicenseService } from '../services/subscriptionLicenseService';
import { DeviceFingerprintGenerator } from './deviceFingerprint';

export class OfflineSubscriptionDemo {
  private licenseManager: LicenseManager;
  private validationService: LicenseValidationService;
  private subscriptionService: SubscriptionLicenseService;
  private fingerprintGenerator: DeviceFingerprintGenerator;
  
  constructor() {
    this.licenseManager = LicenseManager.getInstance();
    this.validationService = LicenseValidationService.getInstance();
    this.subscriptionService = SubscriptionLicenseService.getInstance();
    this.fingerprintGenerator = DeviceFingerprintGenerator.getInstance();
  }
  
  /**
   * Demo: Complete offline subscription workflow
   */
  public async runDemo(): Promise<void> {
    console.log('🚀 Starting Offline Subscription Demo');
    console.log('=====================================');
    
    try {
      // Step 1: Generate device fingerprint
      console.log('\n1️⃣ Generating device fingerprint...');
      const fingerprint = await this.fingerprintGenerator.generateFingerprint();
      console.log('✅ Device fingerprint:', fingerprint.fingerprint_hash.substring(0, 16) + '...');
      console.log('📱 Device description:', await this.fingerprintGenerator.getDeviceDescription());
      
      // Step 2: Create a trial license
      console.log('\n2️⃣ Creating trial license...');
      const storeId = 'demo-store-123';
      const storeName = 'Demo Store';
      
      const trialLicense = await this.licenseManager.generateTrialLicense(storeId, storeName, 30);
      console.log('✅ Trial license created');
      console.log('📄 License info:', this.licenseManager.getLicenseInfo(trialLicense));
      
      // Step 3: Install the license
      console.log('\n3️⃣ Installing license...');
      const installResult = await this.licenseManager.installLicense(trialLicense, storeId);
      console.log('✅ License installation:', installResult.message);
      
      // Step 4: Validate subscription
      console.log('\n4️⃣ Validating subscription...');
      const validation = await this.validationService.validateSubscription(storeId);
      console.log('✅ Validation result:', {
        isValid: validation.isValid,
        status: validation.status,
        message: validation.message,
        daysRemaining: validation.daysRemaining
      });
      
      // Step 5: Check feature availability
      console.log('\n5️⃣ Checking feature availability...');
      const features = ['qrPrinting', 'notifications', 'cloudSync', 'multiDevice'];
      
      for (const feature of features) {
        const isEnabled = await this.subscriptionService.isFeatureEnabled(storeId, feature as any);
        console.log(`${isEnabled ? '✅' : '❌'} ${feature}: ${isEnabled ? 'Enabled' : 'Disabled'}`);
      }
      
      // Step 6: Check usage limits
      console.log('\n6️⃣ Checking usage limits...');
      const status = await this.subscriptionService.getSubscriptionStatus(storeId);
      console.log('📊 Subscription limits:', {
        tier: status.tier,
        branches: status.limits.branches,
        users: status.limits.users,
        products: status.limits.products === -1 ? 'Unlimited' : status.limits.products
      });
      
      // Step 7: Export/Import license
      console.log('\n7️⃣ Testing license export/import...');
      const exportedLicense = this.licenseManager.exportLicenseFile(trialLicense);
      console.log('✅ License exported (JSON length:', exportedLicense.length, 'chars)');
      
      const importedLicense = this.licenseManager.importLicenseFile(exportedLicense);
      console.log('✅ License imported successfully');
      console.log('🔍 Imported license matches:', importedLicense.store_id === trialLicense.store_id);
      
      // Step 8: Device validation
      console.log('\n8️⃣ Testing device validation...');
      const deviceValidation = await this.licenseManager.validateLicenseForDevice(trialLicense);
      console.log('✅ Device validation:', {
        isValid: deviceValidation.isValid,
        deviceMatch: deviceValidation.deviceMatch,
        expired: deviceValidation.expired,
        message: deviceValidation.message
      });
      
      console.log('\n🎉 Demo completed successfully!');
      console.log('=====================================');
      
    } catch (error) {
      console.error('❌ Demo failed:', error);
    }
  }
  
  /**
   * Demo: Create different subscription tiers
   */
  public async demonstrateTiers(): Promise<void> {
    console.log('\n📋 Subscription Tiers Demonstration');
    console.log('====================================');
    
    const storeId = 'demo-store-tiers';
    const storeName = 'Multi-Tier Demo Store';
    const fingerprint = await this.fingerprintGenerator.generateFingerprint();
    
    const tiers = ['starter', 'professional', 'premium'] as const;
    
    for (const tier of tiers) {
      console.log(`\n🏷️ ${tier.toUpperCase()} TIER:`);
      
      // Create license for this tier
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365); // 1 year
      
      const license = await this.licenseManager.createLicenseFile({
        storeId: `${storeId}-${tier}`,
        storeName: `${storeName} (${tier})`,
        tier,
        expiresAt: expiresAt.toISOString(),
        deviceFingerprint: fingerprint.fingerprint_hash
      });
      
      const info = this.licenseManager.getLicenseInfo(license);
      console.log('📊 Limits:', info.limits);
      console.log('🎯 Features:', info.features.length, 'enabled features');
      console.log('💰 Pricing: $' + license.tier === 'starter' ? '20' : license.tier === 'professional' ? '50' : '149', '/month');
    }
  }
  
  /**
   * Demo: Offline validation scenarios
   */
  public async demonstrateOfflineScenarios(): Promise<void> {
    console.log('\n🔒 Offline Validation Scenarios');
    console.log('================================');
    
    const storeId = 'demo-offline-scenarios';
    
    // Scenario 1: No subscription
    console.log('\n📍 Scenario 1: No subscription installed');
    const noSubStatus = await this.subscriptionService.getSubscriptionStatus(storeId);
    console.log('Result:', {
      hasSubscription: noSubStatus.isActive,
      tier: noSubStatus.tier,
      message: 'Falls back to starter tier (limited features)'
    });
    
    // Scenario 2: Valid subscription
    console.log('\n📍 Scenario 2: Valid subscription');
    const validLicense = await this.licenseManager.generateTrialLicense(storeId, 'Valid Store', 30);
    await this.licenseManager.installLicense(validLicense, storeId);
    
    const validStatus = await this.subscriptionService.getSubscriptionStatus(storeId);
    console.log('Result:', {
      hasSubscription: validStatus.isActive,
      tier: validStatus.tier,
      expiresAt: validStatus.expiresAt,
      message: 'Full features available'
    });
    
    // Scenario 3: Expired subscription (would need time manipulation to demo)
    console.log('\n📍 Scenario 3: Expired subscription');
    console.log('Result: Would enter grace period, then disable features');
    
    // Scenario 4: Device mismatch (would need different fingerprint)
    console.log('\n📍 Scenario 4: Device mismatch');
    console.log('Result: License validation would fail, features disabled');
  }
  
  /**
   * Get current system status
   */
  public async getSystemStatus(storeId: string): Promise<{
    hasValidSubscription: boolean;
    tier: string;
    featuresEnabled: string[];
    featuresDisabled: string[];
    expirationInfo: string;
    deviceInfo: string;
  }> {
    const status = await this.subscriptionService.getSubscriptionStatus(storeId);
    const deviceDesc = await this.fingerprintGenerator.getDeviceDescription();
    
    const allFeatures = Object.keys(status.limits.features);
    const featuresEnabled = [];
    const featuresDisabled = [];
    
    for (const feature of allFeatures) {
      const enabled = await this.subscriptionService.isFeatureEnabled(storeId, feature as any);
      if (enabled) {
        featuresEnabled.push(feature);
      } else {
        featuresDisabled.push(feature);
      }
    }
    
    let expirationInfo = 'No expiration';
    if (status.expiresAt) {
      const daysRemaining = Math.ceil((status.expiresAt.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      expirationInfo = `${daysRemaining} days remaining`;
    }
    
    return {
      hasValidSubscription: status.isActive,
      tier: status.tier,
      featuresEnabled,
      featuresDisabled,
      expirationInfo,
      deviceInfo: deviceDesc
    };
  }
}
