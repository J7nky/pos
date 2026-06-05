import { describe, it, expect, beforeEach, vi } from 'vitest';
import { entityBalanceCache } from '../../src/services/entityBalanceCache';

describe('entityBalanceCache', () => {
  beforeEach(() => {
    entityBalanceCache._reset();
  });

  describe('get / set', () => {
    it('returns undefined for a miss', () => {
      expect(entityBalanceCache.get('customer', 'nope')).toBeUndefined();
    });

    it('stores and retrieves a balance', () => {
      entityBalanceCache.set('customer', 'c-1', { USD: 100, LBP: 150_000 });
      expect(entityBalanceCache.get('customer', 'c-1')).toEqual({
        byCurrency: { USD: 100, LBP: 150_000 },
        USD: 100,
        LBP: 150_000,
      });
    });

    it('keys separately by entity type so supplier and customer do not collide', () => {
      entityBalanceCache.set('customer', 'shared-id', { USD: 10, LBP: 0 });
      entityBalanceCache.set('supplier', 'shared-id', { USD: 20, LBP: 0 });
      expect(entityBalanceCache.get('customer', 'shared-id')).toEqual({
        byCurrency: { USD: 10 },
        USD: 10,
        LBP: 0,
      });
      expect(entityBalanceCache.get('supplier', 'shared-id')).toEqual({
        byCurrency: { USD: 20 },
        USD: 20,
        LBP: 0,
      });
      expect(entityBalanceCache._size()).toBe(2);
    });

    it('overwrites an existing entry on set', () => {
      entityBalanceCache.set('customer', 'c-1', { USD: 100, LBP: 0 });
      entityBalanceCache.set('customer', 'c-1', { USD: 250, LBP: 0 });
      expect(entityBalanceCache.get('customer', 'c-1')).toEqual({
        byCurrency: { USD: 250 },
        USD: 250,
        LBP: 0,
      });
      expect(entityBalanceCache._size()).toBe(1);
    });
  });

  describe('invalidate', () => {
    it('removes a specific entry and reports whether anything was removed', () => {
      entityBalanceCache.set('customer', 'c-1', { USD: 100, LBP: 0 });
      expect(entityBalanceCache.invalidate('customer', 'c-1')).toBe(true);
      expect(entityBalanceCache.get('customer', 'c-1')).toBeUndefined();
      expect(entityBalanceCache.invalidate('customer', 'c-1')).toBe(false);
    });

    it('invalidateAll clears every entry', () => {
      entityBalanceCache.set('customer', 'c-1', { USD: 100, LBP: 0 });
      entityBalanceCache.set('supplier', 's-1', { USD: 50, LBP: 0 });
      entityBalanceCache.invalidateAll();
      expect(entityBalanceCache._size()).toBe(0);
    });
  });

  describe('subscribe', () => {
    it('does NOT notify subscribers on set (notification is invalidate-driven)', () => {
      const fn = vi.fn();
      entityBalanceCache.subscribe(fn);
      entityBalanceCache.set('customer', 'c-1', { USD: 100, LBP: 0 });
      // set() is intentionally silent: it only runs inside a hook's own fetch
      // path, which updates its React state directly. Notifying here made a
      // fresh load of N entities fire N notifications → O(N²) re-renders.
      expect(fn).not.toHaveBeenCalled();
    });

    it('notifies subscribers on invalidate (only when something was removed)', () => {
      entityBalanceCache.set('customer', 'c-1', { USD: 100, LBP: 0 });
      const fn = vi.fn();
      entityBalanceCache.subscribe(fn);
      entityBalanceCache.invalidate('customer', 'c-1');
      expect(fn).toHaveBeenCalledTimes(1);
      entityBalanceCache.invalidate('customer', 'c-1'); // already gone — no-op
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe stops further notifications', () => {
      entityBalanceCache.set('customer', 'c-1', { USD: 1, LBP: 0 });
      entityBalanceCache.set('customer', 'c-2', { USD: 2, LBP: 0 });
      const fn = vi.fn();
      const unsubscribe = entityBalanceCache.subscribe(fn);
      entityBalanceCache.invalidate('customer', 'c-1'); // notifies
      unsubscribe();
      entityBalanceCache.invalidate('customer', 'c-2'); // would notify, but unsubscribed
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('invalidateAll notifies only when the cache was non-empty', () => {
      const fn = vi.fn();
      entityBalanceCache.subscribe(fn);
      entityBalanceCache.invalidateAll(); // empty → no-op
      expect(fn).not.toHaveBeenCalled();
      entityBalanceCache.set('customer', 'c-1', { USD: 1, LBP: 0 });
      fn.mockClear();
      entityBalanceCache.invalidateAll();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('a throwing subscriber does not break other subscribers (failure path)', () => {
      entityBalanceCache.set('customer', 'c-1', { USD: 1, LBP: 0 });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const good = vi.fn();
      entityBalanceCache.subscribe(() => {
        throw new Error('boom');
      });
      entityBalanceCache.subscribe(good);
      entityBalanceCache.invalidate('customer', 'c-1'); // notifies subscribers
      expect(good).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
