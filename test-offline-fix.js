// Test script to verify offline functionality
// Run this in the browser console after the app loads

console.log('🧪 Testing offline functionality...');

// Test 1: Check if user profile is cached
function testUserProfileCache() {
  const userId = '10c75020-73e0-4351-8237-34a2637771e8'; // Replace with actual user ID
  const cached = localStorage.getItem(`user_profile_${userId}`);
  
  if (cached) {
    console.log('✅ User profile is cached:', JSON.parse(cached));
    return true;
  } else {
    console.log('❌ No cached user profile found');
    return false;
  }
}

// Test 2: Simulate offline mode
function simulateOffline() {
  console.log('📱 Simulating offline mode...');
  
  // Override navigator.onLine
  Object.defineProperty(navigator, 'onLine', {
    writable: true,
    value: false
  });
  
  // Dispatch offline event
  window.dispatchEvent(new Event('offline'));
  
  console.log('✅ Offline mode simulated - should show toast notification');
}

// Test 3: Simulate online mode
function simulateOnline() {
  console.log('🌐 Simulating online mode...');
  
  // Override navigator.onLine
  Object.defineProperty(navigator, 'onLine', {
    writable: true,
    value: true
  });
  
  // Dispatch online event
  window.dispatchEvent(new Event('online'));
  
  console.log('✅ Online mode simulated - should show toast notification');
}

// Test 4: Check network status hook
function testNetworkStatus() {
  console.log('🔍 Current network status:', {
    navigatorOnLine: navigator.onLine,
    windowOnline: window.navigator.onLine
  });
}

// Test 5: Check for toast notifications
function checkToastNotifications() {
  const toasts = document.querySelectorAll('[role="alert"]');
  console.log('🔔 Current toast notifications:', toasts.length);
  toasts.forEach((toast, index) => {
    console.log(`  Toast ${index + 1}:`, toast.textContent);
  });
}

// Run all tests
console.log('Running offline functionality tests...');
testNetworkStatus();
testUserProfileCache();
checkToastNotifications();

console.log('📋 Available test functions:');
console.log('- simulateOffline() - Simulate offline mode (shows toast)');
console.log('- simulateOnline() - Simulate online mode (shows toast)');
console.log('- testUserProfileCache() - Check cached user profile');
console.log('- testNetworkStatus() - Check current network status');
console.log('- checkToastNotifications() - Check for visible toast notifications');

console.log('🧪 Test setup complete! Try running simulateOffline() to test offline behavior.');
console.log('💡 Note: Toast notifications will appear in the top-right corner and auto-dismiss after 3 seconds.');
