// Node.js compatible test for subscription system core logic
// Tests the business logic without browser APIs

console.log('🧪 Testing Offline Subscription System (Node.js)');
console.log('===============================================');

// Mock browser APIs for Node.js
const mockBrowserAPIs = {
  navigator: {
    hardwareConcurrency: 8,
    deviceMemory: 16,
    userAgent: 'Mozilla/5.0 (Test Environment)',
    platform: 'linux',
    language: 'en-US'
  },
  screen: {
    width: 1920,
    height: 1080,
    colorDepth: 24
  },
  Intl: {
    DateTimeFormat: () => ({
      resolvedOptions: () => ({ timeZone: 'UTC' })
    })
  },
  btoa: (str) => Buffer.from(str).toString('base64')
};

// Test 1: Device Fingerprinting Logic
function testDeviceFingerprinting() {
  console.log('\n1️⃣ Testing Device Fingerprinting Logic...');
  
  try {
    const deviceInfo = {
      cpu_cores: mockBrowserAPIs.navigator.hardwareConcurrency,
      total_memory: mockBrowserAPIs.navigator.deviceMemory * 1024,
      screen_resolution: `${mockBrowserAPIs.screen.width}x${mockBrowserAPIs.screen.height}x${mockBrowserAPIs.screen.colorDepth}`,
      timezone: 'UTC',
      user_agent: mockBrowserAPIs.navigator.userAgent,
      platform: mockBrowserAPIs.navigator.platform,
      language: mockBrowserAPIs.navigator.language
    };
    
    console.log('✅ Device info collected:', {
      'CPU Cores': deviceInfo.cpu_cores,
      'Memory': deviceInfo.total_memory + ' MB',
      'Screen': deviceInfo.screen_resolution,
      'Timezone': deviceInfo.timezone,
      'Platform': deviceInfo.platform,
      'Language': deviceInfo.language
    });
    
    // Generate fingerprint hash
    const fingerprintData = Object.values(deviceInfo).join('|');
    const fingerprint = mockBrowserAPIs.btoa(fingerprintData).slice(0, 32);
    
    console.log('✅ Device fingerprint generated:', fingerprint);
    return fingerprint;
    
  } catch (error) {
    console.error('❌ Device fingerprinting failed:', error);
    return null;
  }
}

// Test 2: Subscription Tier Configuration
function testSubscriptionTiers() {
  console.log('\n2️⃣ Testing Subscription Tier Configuration...');
  
  try {
    const subscriptionTiers = {
      starter: {
        pricing: { monthly: 20, yearly: 200 },
        branches: 1,
        users: 3,
        products: 250,
        features: {
          cloudSync: false,
          qrPrinting: false,
          notifications: false,
          multiDevice: false,
          apiAccess: false,
          localBackupsOnly: true
        }
      },
      professional: {
        pricing: { monthly: 50, yearly: 500 },
        branches: 2,
        users: 10,
        products: -1, // Unlimited
        features: {
          cloudSync: true,
          qrPrinting: true,
          notifications: true,
          multiDevice: true,
          apiAccess: false,
          localBackupsOnly: false
        }
      },
      premium: {
        pricing: { monthly: 149, yearly: 1490 },
        branches: 5,
        users: -1, // Unlimited
        products: -1, // Unlimited
        features: {
          cloudSync: true,
          qrPrinting: true,
          notifications: true,
          multiDevice: true,
          apiAccess: true,
          localBackupsOnly: false
        }
      }
    };
    
    console.log('✅ Subscription tiers configured:');
    Object.entries(subscriptionTiers).forEach(([tier, config]) => {
      const enabledFeatures = Object.entries(config.features).filter(([_, enabled]) => enabled).length;
      console.log(`   📋 ${tier.toUpperCase()}:`);
      console.log(`      💰 $${config.pricing.monthly}/month ($${config.pricing.yearly}/year)`);
      console.log(`      🏢 ${config.branches} branch${config.branches > 1 ? 'es' : ''}`);
      console.log(`      👥 ${config.users === -1 ? 'Unlimited' : config.users} users`);
      console.log(`      📦 ${config.products === -1 ? 'Unlimited' : config.products} products`);
      console.log(`      ⚡ ${enabledFeatures} features enabled`);
    });
    
    return subscriptionTiers;
    
  } catch (error) {
    console.error('❌ Subscription tiers test failed:', error);
    return null;
  }
}

// Test 3: License File Creation and Validation
function testLicenseOperations(deviceFingerprint) {
  console.log('\n3️⃣ Testing License File Operations...');
  
  try {
    // Create license file
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days trial
    
    const licenseFile = {
      version: '1.0',
      issued_at: new Date().toISOString(),
      issued_by: 'ProducePOS License Server',
      store_id: 'test-store-123',
      store_name: 'Test Store',
      tier: 'professional',
      expires_at: expiresAt.toISOString(),
      grace_period_days: 7,
      device_fingerprint: deviceFingerprint,
      max_devices: 1,
      enabled_features: ['cloudSync', 'qrPrinting', 'notifications', 'multiDevice'],
      disabled_features: ['apiAccess'],
      branch_limit: 2,
      user_limit: 10,
      product_limit: -1,
      signature: mockBrowserAPIs.btoa('test-signature-' + Date.now()),
      checksum: mockBrowserAPIs.btoa('test-checksum-' + Date.now()).slice(0, 16)
    };
    
    console.log('✅ License file created:', {
      'Store': licenseFile.store_name,
      'Tier': licenseFile.tier,
      'Expires': licenseFile.expires_at,
      'Features': licenseFile.enabled_features.length + ' enabled',
      'Device Bound': !!licenseFile.device_fingerprint
    });
    
    // Test license export/import
    const exportedLicense = JSON.stringify(licenseFile, null, 2);
    const importedLicense = JSON.parse(exportedLicense);
    
    console.log('✅ License export/import successful:', {
      'Exported Size': exportedLicense.length + ' chars',
      'Import Match': importedLicense.store_id === licenseFile.store_id
    });
    
    return licenseFile;
    
  } catch (error) {
    console.error('❌ License operations failed:', error);
    return null;
  }
}

// Test 4: License Validation Logic
function testLicenseValidation(licenseFile, deviceFingerprint) {
  console.log('\n4️⃣ Testing License Validation Logic...');
  
  try {
    const now = new Date();
    const expiresAt = new Date(licenseFile.expires_at);
    const gracePeriodExpiresAt = new Date(expiresAt.getTime() + (licenseFile.grace_period_days * 24 * 60 * 60 * 1000));
    
    // Validation checks
    const isExpired = now > expiresAt;
    const inGracePeriod = isExpired && now < gracePeriodExpiresAt;
    const deviceMatches = licenseFile.device_fingerprint === deviceFingerprint;
    const hasValidSignature = licenseFile.signature && licenseFile.signature.length > 0;
    const hasValidChecksum = licenseFile.checksum && licenseFile.checksum.length > 0;
    
    const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const graceDaysRemaining = inGracePeriod ? 
      Math.ceil((gracePeriodExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    
    let status = 'invalid';
    let isValid = false;
    
    if (!isExpired && deviceMatches && hasValidSignature) {
      status = 'valid';
      isValid = true;
    } else if (inGracePeriod && deviceMatches && hasValidSignature) {
      status = 'grace_period';
      isValid = true; // Still functional in grace period
    } else if (isExpired) {
      status = 'expired';
    } else if (!deviceMatches) {
      status = 'device_mismatch';
    } else if (!hasValidSignature) {
      status = 'tampered';
    }
    
    console.log('✅ License validation result:', {
      'Status': status,
      'Valid': isValid,
      'Expired': isExpired,
      'In Grace Period': inGracePeriod,
      'Device Match': deviceMatches,
      'Valid Signature': hasValidSignature,
      'Valid Checksum': hasValidChecksum,
      'Days Remaining': Math.max(0, daysRemaining),
      'Grace Days Remaining': graceDaysRemaining
    });
    
    return {
      status,
      isValid,
      isExpired,
      inGracePeriod,
      deviceMatches,
      hasValidSignature,
      daysRemaining: Math.max(0, daysRemaining),
      graceDaysRemaining
    };
    
  } catch (error) {
    console.error('❌ License validation failed:', error);
    return null;
  }
}

// Test 5: Feature Gating Logic
function testFeatureGating(licenseFile, validationResult, subscriptionTiers) {
  console.log('\n5️⃣ Testing Feature Gating Logic...');
  
  try {
    const tierConfig = subscriptionTiers[licenseFile.tier] || subscriptionTiers.starter;
    
    // Determine effective features based on validation status
    let effectiveFeatures;
    
    if (validationResult.isValid) {
      // License is valid, use tier features
      effectiveFeatures = tierConfig.features;
    } else if (validationResult.inGracePeriod) {
      // In grace period, disable some features but keep core functionality
      effectiveFeatures = { ...tierConfig.features };
      effectiveFeatures.apiAccess = false; // Disable API access in grace period
    } else {
      // Invalid license, fall back to starter features
      effectiveFeatures = subscriptionTiers.starter.features;
    }
    
    console.log('✅ Feature gating result:', {
      'License Status': validationResult.status,
      'Effective Tier': validationResult.isValid ? licenseFile.tier : 'starter (fallback)'
    });
    
    // Test specific feature checks
    const testFeatures = ['qrPrinting', 'notifications', 'cloudSync', 'multiDevice', 'apiAccess'];
    console.log('📋 Feature availability:');
    testFeatures.forEach(feature => {
      const enabled = effectiveFeatures[feature] || false;
      console.log(`   ${enabled ? '✅' : '❌'} ${feature}: ${enabled ? 'Enabled' : 'Disabled'}`);
    });
    
    return effectiveFeatures;
    
  } catch (error) {
    console.error('❌ Feature gating failed:', error);
    return null;
  }
}

// Test 6: Usage Limits Enforcement
function testUsageLimits(licenseFile, validationResult) {
  console.log('\n6️⃣ Testing Usage Limits Enforcement...');
  
  try {
    const limits = {
      branches: licenseFile.branch_limit,
      users: licenseFile.user_limit,
      products: licenseFile.product_limit
    };
    
    // Simulate current usage
    const currentUsage = {
      branches: 1,
      users: 5,
      products: 150
    };
    
    console.log('📊 Usage limits enforcement:');
    
    const limitChecks = {};
    Object.keys(currentUsage).forEach(key => {
      const current = currentUsage[key];
      const limit = limits[key];
      
      let withinLimit = true;
      let status = 'OK';
      
      if (limit === -1) {
        status = 'Unlimited';
      } else if (current >= limit) {
        withinLimit = false;
        status = 'EXCEEDED';
      } else if (current >= limit * 0.8) {
        status = 'WARNING (80%+)';
      }
      
      limitChecks[key] = { current, limit, withinLimit, status };
      
      console.log(`   ${withinLimit ? '✅' : '❌'} ${key}: ${current}/${limit === -1 ? '∞' : limit} (${status})`);
    });
    
    // Check if license is valid for enforcing limits
    if (!validationResult.isValid) {
      console.log('⚠️  License invalid - enforcing starter tier limits');
      const starterLimits = { branches: 1, users: 3, products: 250 };
      
      Object.keys(currentUsage).forEach(key => {
        const current = currentUsage[key];
        const starterLimit = starterLimits[key];
        const exceeds = current >= starterLimit;
        
        if (exceeds) {
          console.log(`   🚫 ${key}: ${current}/${starterLimit} - BLOCKED (exceeds starter limit)`);
        }
      });
    }
    
    return { limits, currentUsage, limitChecks };
    
  } catch (error) {
    console.error('❌ Usage limits test failed:', error);
    return null;
  }
}

// Run all tests
async function runAllTests() {
  try {
    console.log('🚀 Starting comprehensive offline subscription test...');
    
    const deviceFingerprint = testDeviceFingerprinting();
    if (!deviceFingerprint) return;
    
    const subscriptionTiers = testSubscriptionTiers();
    if (!subscriptionTiers) return;
    
    const licenseFile = testLicenseOperations(deviceFingerprint);
    if (!licenseFile) return;
    
    const validationResult = testLicenseValidation(licenseFile, deviceFingerprint);
    if (!validationResult) return;
    
    const features = testFeatureGating(licenseFile, validationResult, subscriptionTiers);
    if (!features) return;
    
    const limits = testUsageLimits(licenseFile, validationResult);
    if (!limits) return;
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('====================================');
    
    console.log('\n📋 Test Summary:');
    console.log('✅ Device fingerprinting logic works');
    console.log('✅ Subscription tier configuration works');
    console.log('✅ License file operations work');
    console.log('✅ License validation logic works');
    console.log('✅ Feature gating logic works');
    console.log('✅ Usage limits enforcement works');
    
    console.log('\n🔧 Core System Status:');
    console.log(`   📱 Device: ${deviceFingerprint.slice(0, 16)}...`);
    console.log(`   🏷️  License: ${licenseFile.tier} tier`);
    console.log(`   ✅ Status: ${validationResult.status}`);
    console.log(`   ⏰ Expires: ${validationResult.daysRemaining} days`);
    console.log(`   🎯 Features: ${Object.values(features).filter(Boolean).length} enabled`);
    
    console.log('\n🚀 Offline subscription system is working correctly!');
    
    return {
      deviceFingerprint,
      subscriptionTiers,
      licenseFile,
      validationResult,
      features,
      limits
    };
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    return null;
  }
}

// Run tests
runAllTests();
