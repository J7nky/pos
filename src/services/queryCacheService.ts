import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Cache configuration
interface CacheConfig {
  defaultTTL: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of cached items
  cleanupInterval: number; // Cleanup interval in milliseconds
}

// Cache item structure
interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

// Query cache service
export class QueryCacheService {
  private cache = new Map<string, CacheItem<any>>();
  private config: CacheConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient, config?: Partial<CacheConfig>) {
    this.supabase = supabase;
    this.config = {
      defaultTTL: 5 * 60 * 1000, // 5 minutes default
      maxSize: 1000, // Maximum 1000 cached items
      cleanupInterval: 60 * 1000, // Cleanup every minute
      ...config
    };

    this.startCleanupTimer();
  }

  /**
   * Get data from cache or fetch from database
   */
  async getOrFetch<T>(
    key: string,
    queryFn: () => Promise<T>,
    options?: {
      ttl?: number;
      forceRefresh?: boolean;
    }
  ): Promise<T> {
    const cacheKey = this.generateCacheKey(key);
    
    // Check if we should force refresh
    if (options?.forceRefresh) {
      return this.fetchAndCache(cacheKey, queryFn, options.ttl);
    }

    // Try to get from cache
    const cached = this.cache.get(cacheKey);
    if (cached && !this.isExpired(cached)) {
      // Update access statistics
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      return cached.data;
    }

    // Fetch from database and cache
    return this.fetchAndCache(cacheKey, queryFn, options?.ttl);
  }

  /**
   * Fetch data and cache it
   */
  private async fetchAndCache<T>(
    key: string,
    queryFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    try {
      const data = await queryFn();
      const cacheItem: CacheItem<T> = {
        data,
        timestamp: Date.now(),
        ttl: ttl || this.config.defaultTTL,
        accessCount: 1,
        lastAccessed: Date.now()
      };

      // Check cache size limit
      if (this.cache.size >= this.config.maxSize) {
        this.evictLeastUsed();
      }

      this.cache.set(key, cacheItem);
      return data;
    } catch (error) {
      console.error('Error fetching data for cache:', error);
      throw error;
    }
  }

  /**
   * Generate a unique cache key
   */
  private generateCacheKey(key: string): string {
    return `query_cache:${key}`;
  }

  /**
   * Check if a cache item is expired
   */
  private isExpired(item: CacheItem<any>): boolean {
    return Date.now() - item.timestamp > item.ttl;
  }

  /**
   * Evict least used items when cache is full
   */
  private evictLeastUsed(): void {
    const items = Array.from(this.cache.entries());
    
    // Sort by access count and last accessed time
    items.sort((a, b) => {
      if (a[1].accessCount !== b[1].accessCount) {
        return a[1].accessCount - b[1].accessCount;
      }
      return a[1].lastAccessed - b[1].lastAccessed;
    });

    // Remove the least used items (bottom 20%)
    const itemsToRemove = Math.ceil(items.length * 0.2);
    for (let i = 0; i < itemsToRemove; i++) {
      this.cache.delete(items[i][0]);
    }
  }

  /**
   * Start the cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Clean up expired cache items
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (this.isExpired(item)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear specific cache key
   */
  clearKey(key: string): void {
    const cacheKey = this.generateCacheKey(key);
    this.cache.delete(cacheKey);
  }

  /**
   * Clear all cache
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
  } {
    let totalHits = 0;
    let totalMisses = 0;

    for (const item of this.cache.values()) {
      totalHits += item.accessCount;
    }

    const hitRate = totalHits > 0 ? totalHits / (totalHits + totalMisses) : 0;

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate,
      totalHits,
      totalMisses
    };
  }

  /**
   * Preload frequently accessed data
   */
  async preloadData(): Promise<void> {
    console.log('🔄 Preloading frequently accessed data...');
    
    const preloadQueries = [
      {
        key: 'stores:all',
        query: () => this.supabase.from('stores').select('*'),
        ttl: 10 * 60 * 1000 // 10 minutes
      },
      {
        key: 'users:all',
        query: () => this.supabase.from('users').select('*'),
        ttl: 5 * 60 * 1000 // 5 minutes
      },
      {
        key: 'products:all',
        query: () => this.supabase.from('products').select('*'),
        ttl: 15 * 60 * 1000 // 15 minutes
      }
    ];

    for (const preload of preloadQueries) {
      try {
        await this.getOrFetch(preload.key, preload.query, { ttl: preload.ttl });
        console.log(`✅ Preloaded: ${preload.key}`);
      } catch (error) {
        console.warn(`⚠️  Failed to preload ${preload.key}:`, error);
      }
    }
  }

  /**
   * Invalidate cache for specific table
   */
  invalidateTable(tableName: string): void {
    const keysToRemove: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (key.includes(tableName)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => this.cache.delete(key));
    console.log(`🗑️  Invalidated cache for table: ${tableName}`);
  }

  /**
   * Destroy the cache service
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cache.clear();
  }
}

// Cache service instance
let cacheServiceInstance: QueryCacheService | null = null;

/**
 * Get or create the cache service instance
 */
export const getQueryCacheService = (supabase: SupabaseClient): QueryCacheService => {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new QueryCacheService(supabase);
  }
  return cacheServiceInstance;
};

/**
 * Clear the cache service instance
 */
export const clearQueryCacheService = (): void => {
  if (cacheServiceInstance) {
    cacheServiceInstance.destroy();
    cacheServiceInstance = null;
  }
};
