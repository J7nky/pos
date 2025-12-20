/**
 * Permission Cache Service
 * 
 * In-memory cache for user permissions to reduce database lookups.
 * Provides fast synchronous permission checks after initial load.
 * Cache is invalidated on sync completion or explicit clear.
 * 
 * Follows offline-first pattern: IndexedDB → Cache → Fast checks
 */

import { PermissionCache, ModuleName, OperationName } from '../types';

class PermissionCacheService {
  private cache: Map<string, PermissionCache> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get cache key for a user
   */
  private getCacheKey(userId: string, storeId: string): string {
    return `${userId}:${storeId}`;
  }

  /**
   * Get cached permissions for a user
   */
  get(userId: string, storeId: string): PermissionCache | null {
    const key = this.getCacheKey(userId, storeId);
    const cached = this.cache.get(key);
    
    if (!cached) {
      return null;
    }

    // Check if cache expired
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached;
  }

  /**
   * Set cached permissions for a user
   */
  set(userId: string, storeId: string, cache: Omit<PermissionCache, 'userId' | 'storeId' | 'expiresAt'>): void {
    const key = this.getCacheKey(userId, storeId);
    const expiresAt = Date.now() + this.CACHE_TTL;
    
    this.cache.set(key, {
      userId,
      storeId,
      ...cache,
      expiresAt
    });
  }

  /**
   * Clear cache for a specific user
   */
  clear(userId: string, storeId: string): void {
    const key = this.getCacheKey(userId, storeId);
    this.cache.delete(key);
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * Check if a module is cached and allowed
   * Returns null if not cached, true/false if cached
   */
  checkModule(userId: string, storeId: string, module: ModuleName): boolean | null {
    const cached = this.get(userId, storeId);
    if (!cached) {
      return null;
    }
    return cached.modules[module] || false;
  }

  /**
   * Check if an operation is cached and allowed
   * Returns null if not cached, true/false if cached
   */
  checkOperation(userId: string, storeId: string, operation: OperationName): boolean | null {
    const cached = this.get(userId, storeId);
    if (!cached) {
      return null;
    }
    return cached.operations[operation] || false;
  }

  /**
   * Get cached accessible branches
   * Returns null if not cached, branch IDs if cached
   */
  getBranches(userId: string, storeId: string): string[] | null {
    const cached = this.get(userId, storeId);
    if (!cached) {
      return null;
    }
    return cached.branches;
  }

  /**
   * Update a single permission in cache (for real-time updates)
   */
  updatePermission(
    userId: string,
    storeId: string,
    operation: OperationName,
    allowed: boolean
  ): void {
    const cached = this.get(userId, storeId);
    if (cached) {
      cached.operations[operation] = allowed;
      
      // If it's a module access operation, also update modules
      if (operation.startsWith('access_')) {
        const module = operation.replace('access_', '') as ModuleName;
        cached.modules[module] = allowed;
      }
    }
  }

}

// Export singleton instance
export const permissionCache = new PermissionCacheService();


