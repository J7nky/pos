/**
 * Vitest Setup File
 * Runs before all tests
 */

import { afterEach, vi } from 'vitest';

// Clear all mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Mock IndexedDB for tests
if (typeof global !== 'undefined') {
  (global as any).indexedDB = {} as any;
}

console.log('✅ Vitest setup complete');
