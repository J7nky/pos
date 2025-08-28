import { useState, useEffect, useCallback, useRef } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { getQueryCacheService, QueryCacheService } from '../services/queryCacheService';

interface UseQueryCacheOptions {
  ttl?: number;
  forceRefresh?: boolean;
  enabled?: boolean;
}

interface UseQueryCacheResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  clearCache: () => void;
  cacheStats: {
    size: number;
    maxSize: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
  };
}

/**
 * React hook for using the query cache service
 */
export function useQueryCache<T>(
  supabase: SupabaseClient,
  cacheKey: string,
  queryFn: () => Promise<T>,
  options: UseQueryCacheOptions = {}
): UseQueryCacheResult<T> {
  const {
    ttl,
    forceRefresh = false,
    enabled = true
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const cacheServiceRef = useRef<QueryCacheService | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize cache service
  useEffect(() => {
    if (supabase && !cacheServiceRef.current) {
      cacheServiceRef.current = getQueryCacheService(supabase);
    }
  }, [supabase]);

  // Fetch data function
  const fetchData = useCallback(async () => {
    if (!cacheServiceRef.current || !enabled) return;

    setLoading(true);
    setError(null);

    try {
      // Cancel previous request if it exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      const result = await cacheServiceRef.current.getOrFetch(
        cacheKey,
        queryFn,
        { ttl, forceRefresh }
      );

      // Check if request was cancelled
      if (abortControllerRef.current.signal.aborted) return;

      setData(result);
    } catch (err) {
      // Check if request was cancelled
      if (abortControllerRef.current?.signal.aborted) return;

      const error = err instanceof Error ? err : new Error('Unknown error occurred');
      setError(error);
      console.error('Error fetching cached data:', error);
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setLoading(false);
      }
    }
  }, [cacheKey, queryFn, ttl, forceRefresh, enabled]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refetch function
  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  // Clear cache function
  const clearCache = useCallback(() => {
    if (cacheServiceRef.current) {
      cacheServiceRef.current.clearKey(cacheKey);
      setData(null);
    }
  }, [cacheKey]);

  // Get cache statistics
  const cacheStats = cacheServiceRef.current?.getStats() || {
    size: 0,
    maxSize: 0,
    hitRate: 0,
    totalHits: 0,
    totalMisses: 0
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    data,
    loading,
    error,
    refetch,
    clearCache,
    cacheStats
  };
}

/**
 * Hook for managing multiple cached queries
 */
export function useMultipleQueryCache<T>(
  supabase: SupabaseClient,
  queries: Array<{
    key: string;
    queryFn: () => Promise<T>;
    options?: UseQueryCacheOptions;
  }>
) {
  const [results, setResults] = useState<Array<{
    key: string;
    data: T | null;
    loading: boolean;
    error: Error | null;
  }>>([]);

  const cacheServiceRef = useRef<QueryCacheService | null>(null);

  // Initialize cache service
  useEffect(() => {
    if (supabase && !cacheServiceRef.current) {
      cacheServiceRef.current = getQueryCacheService(supabase);
    }
  }, [supabase]);

  // Fetch all queries
  const fetchAll = useCallback(async () => {
    if (!cacheServiceRef.current) return;

    const newResults = await Promise.all(
      queries.map(async ({ key, queryFn, options }) => {
        try {
          const data = await cacheServiceRef.current!.getOrFetch(
            key,
            queryFn,
            options
          );
          return { key, data, loading: false, error: null };
        } catch (error) {
          return {
            key,
            data: null,
            loading: false,
            error: error instanceof Error ? error : new Error('Unknown error')
          };
        }
      })
    );

    setResults(newResults);
  }, [queries]);

  // Initial fetch
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Refetch all
  const refetchAll = useCallback(async () => {
    await fetchAll();
  }, [fetchAll]);

  // Clear all cache
  const clearAllCache = useCallback(() => {
    if (cacheServiceRef.current) {
      cacheServiceRef.current.clearAll();
      setResults(queries.map(q => ({ key: q.key, data: null, loading: false, error: null })));
    }
  }, [queries]);

  return {
    results,
    refetchAll,
    clearAllCache,
    cacheStats: cacheServiceRef.current?.getStats()
  };
}

/**
 * Hook for preloading frequently accessed data
 */
export function usePreloadCache(supabase: SupabaseClient) {
  const [preloading, setPreloading] = useState(false);
  const [preloaded, setPreloaded] = useState<string[]>([]);
  const cacheServiceRef = useRef<QueryCacheService | null>(null);

  // Initialize cache service
  useEffect(() => {
    if (supabase && !cacheServiceRef.current) {
      cacheServiceRef.current = getQueryCacheService(supabase);
    }
  }, [supabase]);

  // Preload data
  const preloadData = useCallback(async () => {
    if (!cacheServiceRef.current) return;

    setPreloading(true);
    try {
      await cacheServiceRef.current.preloadData();
      setPreloaded(['stores', 'users', 'products']);
    } catch (error) {
      console.error('Error preloading data:', error);
    } finally {
      setPreloading(false);
    }
  }, []);

  // Auto-preload on mount
  useEffect(() => {
    preloadData();
  }, [preloadData]);

  return {
    preloading,
    preloaded,
    preloadData
  };
}

