// Test Offline Subscription System
// Browser-runnable test for the offline subscription tracking

import { OfflineSubscriptionDemo } from './offlineSubscriptionDemo';

/**
 * Run offline subscription tests in the browser console
 * Usage: Open browser console and run: testOfflineSubscription()
 */
export async function testOfflineSubscription(): Promise<void> {
  console.log('🧪 Testing Offline Subscription System');
  console.log('======================================');
  
  try {
    const demo = new OfflineSubscriptionDemo();
    
    // Run the main demo
    await demo.runDemo();
    
    // Demonstrate different tiers
    await demo.demonstrateTiers();
    
    // Show offline scenarios
    await demo.demonstrateOfflineScenarios();
    
    // Get system status
    console.log('\n📊 Final System Status');
    console.log('======================');
    const status = await demo.getSystemStatus('demo-store-123');
    console.table(status);
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

/**
 * Quick feature check for a store
 */
export async function quickFeatureCheck(storeId: string = 'demo-store'): Promise<void> {
  console.log(`🔍 Quick Feature Check for Store: ${storeId}`);
  console.log('==========================================');
  
  try {
    const demo = new OfflineSubscriptionDemo();
    const status = await demo.getSystemStatus(storeId);
    
    console.log('📋 Subscription Status:');
    console.log(`   Tier: ${status.tier}`);
    console.log(`   Valid: ${status.hasValidSubscription}`);
    console.log(`   Expires: ${status.expirationInfo}`);
    console.log(`   Device: ${status.deviceInfo}`);
    
    console.log('\n✅ Enabled Features:');
    status.featuresEnabled.forEach(feature => {
      console.log(`   ✓ ${feature}`);
    });
    
    console.log('\n❌ Disabled Features:');
    status.featuresDisabled.forEach(feature => {
      console.log(`   ✗ ${feature}`);
    });
    
  } catch (error) {
    console.error('❌ Feature check failed:', error);
  }
}

/**
 * Test license file operations
 */
export async function testLicenseOperations(): Promise<void> {
  console.log('📄 Testing License File Operations');
  console.log('==================================');
  
  try {
    const { LicenseManager } = await import('./licenseManager');
    const licenseManager = LicenseManager.getInstance();
    
    // Create a sample license
    console.log('1️⃣ Creating license file...');
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    
    const license = await licenseManager.createLicenseFile({
      storeId: 'test-store-001',
      storeName: 'Test Store',
      tier: 'professional',
      expiresAt: expiresAt.toISOString(),
      gracePeriodDays: 14
    });
    
    console.log('✅ License created:', license.store_name);
    
    // Export license
    console.log('2️⃣ Exporting license...');
    const exported = licenseManager.exportLicenseFile(license);
    console.log('✅ License exported (', exported.length, 'characters)');
    
    // Import license
    console.log('3️⃣ Importing license...');
    const imported = licenseManager.importLicenseFile(exported);
    console.log('✅ License imported:', imported.store_name);
    
    // Validate license
    console.log('4️⃣ Validating license...');
    const validation = await licenseManager.validateLicenseForDevice(imported);
    console.log('✅ Validation result:', validation);
    
    // Show license info
    console.log('5️⃣ License information:');
    const info = licenseManager.getLicenseInfo(imported);
    console.table(info);
    
  } catch (error) {
    console.error('❌ License operations failed:', error);
  }
}

/**
 * Test device fingerprinting
 */
export async function testDeviceFingerprinting(): Promise<void> {
  console.log('🔐 Testing Device Fingerprinting');
  console.log('================================');
  
  try {
    const { DeviceFingerprintGenerator } = await import('./deviceFingerprint');
    const generator = DeviceFingerprintGenerator.getInstance();
    
    // Generate fingerprint
    console.log('1️⃣ Generating device fingerprint...');
    const fingerprint1 = await generator.generateFingerprint();
    console.log('✅ Fingerprint 1:', fingerprint1.fingerprint_hash);
    
    // Generate another fingerprint (should be identical)
    console.log('2️⃣ Generating second fingerprint...');
    const fingerprint2 = await generator.generateFingerprint();
    console.log('✅ Fingerprint 2:', fingerprint2.fingerprint_hash);
    
    // Verify fingerprints match
    console.log('3️⃣ Verifying fingerprints match...');
    const verification = await generator.verifyFingerprint(fingerprint1.fingerprint_hash);
    console.log('✅ Verification result:', verification);
    
    // Get device description
    console.log('4️⃣ Getting device description...');
    const description = await generator.getDeviceDescription();
    console.log('✅ Device description:', description);
    
    // Show fingerprint components
    console.log('5️⃣ Fingerprint components:');
    console.table({
      'CPU Cores': fingerprint1.cpu_cores,
      'Memory': fingerprint1.total_memory + ' GB',
      'Screen': fingerprint1.screen_resolution,
      'Timezone': fingerprint1.timezone,
      'Platform': fingerprint1.platform,
      'Language': fingerprint1.language
    });
    
  } catch (error) {
    console.error('❌ Device fingerprinting failed:', error);
  }
}

// Make functions available globally for browser console
if (typeof window !== 'undefined') {
  (window as any).testOfflineSubscription = testOfflineSubscription;
  (window as any).quickFeatureCheck = quickFeatureCheck;
  (window as any).testLicenseOperations = testLicenseOperations;
  (window as any).testDeviceFingerprinting = testDeviceFingerprinting;
  
  console.log('🎯 Offline Subscription Test Functions Available:');
  console.log('   - testOfflineSubscription()');
  console.log('   - quickFeatureCheck(storeId?)');
  console.log('   - testLicenseOperations()');
  console.log('   - testDeviceFingerprinting()');
}
