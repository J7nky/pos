/**
 * Sync parity tests only: real IndexedDB via fake-indexeddb (not the empty stub in src/test/setup.ts).
 */
import 'fake-indexeddb/auto';

Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
