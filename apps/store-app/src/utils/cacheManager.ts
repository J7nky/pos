/**
 * CACHE MANAGER UTILITY
 * 
 * Provides in-memory caching for expensive operations.
 * Expected performance improvement: 20-40% for cached operations.
 * 
 * Features:
 * - Time-based expiration (TTL)
 * - Automatic cleanup of expired entries
 * - Type-safe cache keys
 * - Cache statistics and monitoring
 * - Flexible invalidation strategies
 * 
 * Usage:
 * ```typescript
 * const balance = await withCache(
 *   'balance:store-123:branch-456',
 *   5000, // 5 second TTL
 *   () => calculateBalanceFromTransactions(storeId, branchId)
 * );
 * ```
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheStats {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  avgAccessTime: number;
  oldestEntry?: number;
  newestEntry?: number;
}

export interface CacheOptions {
  ttl?: number;
  forceRefresh?: boolean;
  onCacheHit?: (key: string) => void;
  onCacheMiss?: (key: string) => void;
}

export class CacheManager {
  private static cache = new Map<string, CacheEntry<any>>();
  private static stats = {
    hits: 0,
    misses: 0,
    totalAccessTime: 0,
    accessCount: 0
  };

  /**
   * Default TTL values for different types of data
   */
  static readonly TTL = {
    SHORT: 1000,        // 1 second - for frequently changing data
    MEDIUM: 5000,       // 5 seconds - for moderately stable data
    LONG: 30000,        // 30 seconds - for stable data
    VERY_LONG: 300000,  // 5 minutes - for rarely changing data
    HOUR: 3600000       // 1 hour - for static data
  };

  /**
   * Cache an expensive operation with automatic expiration
   * 
   * @param key - Unique cache key
   * @param ttl - Time to live in milliseconds
   * @param operation - Async function to execute if cache miss
   * @param options - Additional cache options
   * @returns Cached or fresh data
   */
  static async withCache<T>(
    key: string,
    ttl: number,
    operation: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const startTime = Date.now();

    // Check for force refresh
    if (options.forceRefresh) {
      this.invalidate(key);
    }

    // Check cache
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < cached.ttl) {
      // Cache hit
      this.stats.hits++;
      cached.accessCount++;
      cached.lastAccessed = now;
      
      if (options.onCacheHit) {
        options.onCacheHit(key);
      }

      this.stats.totalAccessTime += Date.now() - startTime;
      this.stats.accessCount++;

      return cached.data;
    }

    // Cache miss - execute operation
    this.stats.misses++;
    
    if (options.onCacheMiss) {
      options.onCacheMiss(key);
    }

    const data = await operation();

    // Store in cache
    this.cache.set(key, {
      data,
      timestamp: now,
      ttl: options.ttl || ttl,
      accessCount: 1,
      lastAccessed: now
    });

    this.stats.totalAccessTime += Date.now() - startTime;
    this.stats.accessCount++;

    // Cleanup old entries periodically
    if (this.cache.size > 100) {
      this.cleanupExpired();
    }

    return data;
  }

  /**
   * Synchronous cache wrapper for non-async operations
   */
  static withSyncCache<T>(
    key: string,
    ttl: number,
    operation: () => T,
    options: CacheOptions = {}
  ): T {
    if (options.forceRefresh) {
      this.invalidate(key);
    }

    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < cached.ttl) {
      this.stats.hits++;
      cached.accessCount++;
      cached.lastAccessed = now;
      return cached.data;
    }

    this.stats.misses++;
    const data = operation();

    this.cache.set(key, {
      data,
      timestamp: now,
      ttl: options.ttl || ttl,
      accessCount: 1,
      lastAccessed: now
    });

    return data;
  }

  /**
   * Get cached value without executing operation
   * Returns null if not cached or expired
   */
  static get<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if ((now - cached.timestamp) >= cached.ttl) {
      // Expired
      this.cache.delete(key);
      return null;
    }

    cached.accessCount++;
    cached.lastAccessed = now;
    this.stats.hits++;
    
    return cached.data;
  }

  /**
   * Set cache value directly
   */
  static set<T>(key: string, value: T, ttl: number = CacheManager.TTL.MEDIUM): void {
    const now = Date.now();
    this.cache.set(key, {
      data: value,
      timestamp: now,
      ttl,
      accessCount: 1,
      lastAccessed: now
    });
  }

  /**
   * Invalidate specific cache key
   */
  static invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Invalidate all keys matching pattern
   */
  static invalidatePattern(pattern: string | RegExp): number {
    let count = 0;
    const regex = typeof pattern === 'string' 
      ? new RegExp(pattern.replace(/\*/g, '.*'))
      : pattern;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Invalidate all cache entries for a store
   */
  static invalidateStore(storeId: string): number {
    return this.invalidatePattern(`^[^:]+:${storeId}:`);
  }

  /**
   * Invalidate all cache entries
   */
  static clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      totalAccessTime: 0,
      accessCount: 0
    };
  }

  /**
   * Clean up expired cache entries
   */
  static cleanupExpired(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if ((now - entry.timestamp) >= entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get cache statistics
   */
  static getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const now = Date.now();

    return {
      totalEntries: this.cache.size,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses || 1),
      avgAccessTime: this.stats.totalAccessTime / (this.stats.accessCount || 1),
      oldestEntry: entries.length > 0 
        ? Math.min(...entries.map(e => now - e.timestamp))
        : undefined,
      newestEntry: entries.length > 0
        ? Math.max(...entries.map(e => now - e.timestamp))
        : undefined
    };
  }

  /**
   * Get all cache keys
   */
  static getKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache entry details
   */
  static getEntryDetails(key: string): CacheEntry<any> | null {
    return this.cache.get(key) || null;
  }

  /**
   * Check if key is cached and not expired
   */
  static has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    if ((now - entry.timestamp) >= entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get cache size in entries
   */
  static size(): number {
    return this.cache.size;
  }

  /**
   * Create a scoped cache instance for a specific domain
   */
  static createScoped(prefix: string) {
    return {
      withCache: <T>(
        key: string,
        ttl: number,
        operation: () => Promise<T>,
        options?: CacheOptions
      ) => CacheManager.withCache(`${prefix}:${key}`, ttl, operation, options),

      get: <T>(key: string) => CacheManager.get<T>(`${prefix}:${key}`),
      
      set: <T>(key: string, value: T, ttl?: number) => 
        CacheManager.set(`${prefix}:${key}`, value, ttl),
      
      invalidate: (key: string) => CacheManager.invalidate(`${prefix}:${key}`),
      
      invalidateAll: () => CacheManager.invalidatePattern(`^${prefix}:`),
      
      clear: () => CacheManager.invalidatePattern(`^${prefix}:`)
    };
  }
}

/**
 * Wrapper function for caching async operations
 * Shorthand for CacheManager.withCache
 */
export async function withCache<T>(
  key: string,
  ttl: number,
  operation: () => Promise<T>,
  options?: CacheOptions
): Promise<T> {
  return CacheManager.withCache(key, ttl, operation, options);
}

/**
 * Decorator for caching method results
 * Usage:
 * @cached('balance', CacheManager.TTL.MEDIUM)
 * async getBalance(storeId: string) { ... }
 */
export function cached(keyPrefix: string, ttl: number) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const key = `${keyPrefix}:${JSON.stringify(args)}`;
      return CacheManager.withCache(
        key,
        ttl,
        () => originalMethod.apply(this, args)
      );
    };

    return descriptor;
  };
}

/**
 * Create cache key from parts
 */
export function createCacheKey(...parts: (string | number | undefined)[]): string {
  return parts.filter(p => p !== undefined).join(':');
}

/**
 * Cache key builders for common patterns
 */
export const CacheKeys = {
  balance: (storeId: string, branchId: string) => 
    createCacheKey('balance', storeId, branchId),
  
  transactions: (storeId: string, entityId?: string) =>
    createCacheKey('transactions', storeId, entityId),
  
  entity: (entityType: string, entityId: string) =>
    createCacheKey('entity', entityType, entityId),
  
  session: (storeId: string, branchId: string) =>
    createCacheKey('session', storeId, branchId),
  
  report: (reportType: string, storeId: string, params?: string) =>
    createCacheKey('report', reportType, storeId, params),
    
  query: (queryName: string, ...params: string[]) =>
    createCacheKey('query', queryName, ...params)
};

/**
 * Invalidate every cached cash-drawer / entity balance keyed under `balance:`.
 * Use after any data refresh that may change cash drawer journals (remote sync,
 * payment, undo, advance) — the underlying TTL is 1 s, which is too long when
 * the UI refresh debounce fires immediately after a download.
 */
export function invalidateCashDrawerBalanceCache(): number {
  return CacheManager.invalidatePattern('^balance:');
}

