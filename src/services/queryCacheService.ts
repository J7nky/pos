import { SupabaseClient } from '@supabase/supabase-js';

// Cache configuration - OPTIMIZED for cost efficiency
interface CacheConfig {
  defaultTTL: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of cached items
  cleanupInterval: number; // Cleanup interval in milliseconds
  
  // New: Smart TTL configuration per table type
  tableTTLs: {
    [key: string]: number;
  };
  
  // New: Cost-aware caching
  maxCostPerQuery: number;
  enableSmartEviction: boolean;
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
      defaultTTL: 10 * 60 * 1000, // Increased to 10 minutes default
      maxSize: 2000, // Increased to 2000 cached items
      cleanupInterval: 5 * 60 * 1000, // Cleanup every 5 minutes (was 1 minute)
      
      // Smart TTL configuration per table type
      tableTTLs: {
        // Static/rarely changing data - long TTL
        'products': 30 * 60 * 1000,      // 30 minutes
        'suppliers': 30 * 60 * 1000,     // 30 minutes
        'customers': 20 * 60 * 1000,     // 20 minutes
        'stores': 60 * 60 * 1000,        // 1 hour
        'users': 45 * 60 * 1000,         // 45 minutes
        
        // Semi-dynamic data - medium TTL
        'inventory_bills': 15 * 60 * 1000,   // 15 minutes
        'bills': 10 * 60 * 1000,             // 10 minutes
        'bill_line_items': 10 * 60 * 1000,   // 10 minutes
        
        // Dynamic data - short TTL
        'inventory_items': 5 * 60 * 1000,        // 5 minutes
        'transactions': 3 * 60 * 1000,           // 3 minutes
        'cash_drawer_sessions': 2 * 60 * 1000,   // 2 minutes
        'cash_drawer_accounts': 2 * 60 * 1000,   // 2 minutes
      },
      
      // Cost-aware caching
      maxCostPerQuery: 100,
      enableSmartEviction: true,
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
    const totalMisses = 0; // Will be calculated from access patterns in future

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
   * Preload frequently accessed data - OPTIMIZED for cost efficiency
   * Only preload essential data with smart limits and longer TTLs
   */
  async preloadData(storeId?: string): Promise<void> {
    console.log('🔄 Preloading essential data with cost optimization...');
    
    // OPTIMIZATION: Only preload essential, frequently accessed data
    const preloadQueries = [
      {
        key: `stores:${storeId || 'current'}`,
        query: async () => {
          const query = storeId 
            ? this.supabase.from('stores').select('id, name, preferred_currency, preferred_language').eq('id', storeId).single()
            : this.supabase.from('stores').select('id, name, preferred_currency, preferred_language').limit(10);
          const { data, error } = await query;
          if (error) throw error;
          return data;
        },
        ttl: 60 * 60 * 1000 // 1 hour (stores rarely change)
      },
      {
        key: `products:active:${storeId || 'all'}`,
        query: async () => {
          const query = storeId
            ? this.supabase.from('products').select('id, name, category, unit_price').eq('store_id', storeId).eq('is_active', true).limit(1000)
            : this.supabase.from('products').select('id, name, category, unit_price').eq('is_active', true).limit(500);
          const { data, error } = await query;
          if (error) throw error;
          return data;
        },
        ttl: 30 * 60 * 1000 // 30 minutes
      },
      {
        key: `suppliers:active:${storeId || 'all'}`,
        query: async () => {
          const query = storeId
            ? this.supabase.from('suppliers').select('id, name, phone, type').eq('store_id', storeId).limit(500)
            : this.supabase.from('suppliers').select('id, name, phone, type').limit(200);
          const { data, error } = await query;
          if (error) throw error;
          return data;
        },
        ttl: 30 * 60 * 1000 // 30 minutes
      }
    ];

    // Process preloads with error isolation
    const preloadPromises = preloadQueries.map(async (preload) => {
      try {
        await this.getOrFetch(preload.key, preload.query, { ttl: preload.ttl });
        console.log(`✅ Preloaded: ${preload.key}`);
        return { key: preload.key, success: true };
      } catch (error) {
        console.warn(`⚠️  Failed to preload ${preload.key}:`, error);
        return { key: preload.key, success: false, error };
      }
    });

    const results = await Promise.allSettled(preloadPromises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    console.log(`📊 Preload completed: ${successful}/${preloadQueries.length} successful`);
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

