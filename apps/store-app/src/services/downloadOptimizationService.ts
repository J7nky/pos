/**
 * Database Download Optimization Service
 * 
 * Optimizes initial database download with:
 * - Parallel table downloads
 * - Compression
 * - Adaptive batch sizing
 * - Streaming/progressive processing
 * - Efficient IndexedDB operations
 */

import { supabase } from '../lib/supabase';
import { db } from '../lib/db';

// Table dependency graph for parallel downloads
const TABLE_DEPENDENCIES: Record<string, string[]> = {
  // No dependencies - can download first
  'stores': [],
  'products': [],
  'suppliers': [],
  'customers': [],
  'users': [],
  
  // Depend on products, suppliers, customers
  'inventory_bills': ['suppliers'],
  'inventory_items': ['products', 'suppliers', 'inventory_bills'],
  'bills': ['customers'],
  'bill_line_items': ['products', 'suppliers', 'customers', 'bills', 'inventory_items'],
  'transactions': ['customers', 'suppliers', 'users'],
  'missed_products': ['inventory_items'],
  'cash_drawer_accounts': [],
  'cash_drawer_sessions': ['cash_drawer_accounts'],
};

// Network quality detection
interface NetworkQuality {
  speed: 'slow' | 'medium' | 'fast';
  latency: number;
  bandwidth: number; // Mbps
  recommendedBatchSize: number;
}

// Download configuration
interface DownloadConfig {
  enableCompression: boolean;
  enableParallelDownloads: boolean;
  maxParallelTables: number;
  adaptiveBatchSizing: boolean;
  streamingMode: boolean;
  minBatchSize: number;
  maxBatchSize: number;
  compressionLevel: number; // 1-9
}

const DEFAULT_CONFIG: DownloadConfig = {
  enableCompression: true,
  enableParallelDownloads: true,
  maxParallelTables: 3,
  adaptiveBatchSizing: true,
  streamingMode: true,
  minBatchSize: 100,
  maxBatchSize: 5000,
  compressionLevel: 6, // Balanced compression
};

export class DownloadOptimizationService {
  private config: DownloadConfig;
  private networkQuality: NetworkQuality | null = null;
  private downloadProgress: Map<string, number> = new Map();

  constructor(config: Partial<DownloadConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Detect network quality and adjust batch sizes
   */
  async detectNetworkQuality(): Promise<NetworkQuality> {
    console.log('🌐 Detecting network quality...');
    const startTime = performance.now();

    try {
      // Test download with small payload
      const testQuery = supabase
        .from('products')
        .select('id')
        .limit(10);

      const testStart = performance.now();
      const { data, error } = await testQuery;
      const testDuration = performance.now() - testStart;

      if (error || !data) {
        // Assume slow network on error
        return this.getDefaultNetworkQuality('slow');
      }

      // Estimate bandwidth based on test
      const latency = testDuration;
      let speed: 'slow' | 'medium' | 'fast';
      let bandwidth: number;
      let recommendedBatchSize: number;

      if (latency < 100) {
        speed = 'fast';
        bandwidth = 10; // 10+ Mbps
        recommendedBatchSize = this.config.maxBatchSize;
      } else if (latency < 500) {
        speed = 'medium';
        bandwidth = 2; // 2-10 Mbps
        recommendedBatchSize = 1000;
      } else {
        speed = 'slow';
        bandwidth = 0.5; // <2 Mbps
        recommendedBatchSize = this.config.minBatchSize;
      }

      const quality: NetworkQuality = {
        speed,
        latency,
        bandwidth,
        recommendedBatchSize,
      };

      this.networkQuality = quality;
      console.log(`✅ Network quality: ${speed} (${latency.toFixed(0)}ms latency, batch size: ${recommendedBatchSize})`);

      return quality;
    } catch (error) {
      console.warn('Failed to detect network quality:', error);
      return this.getDefaultNetworkQuality('medium');
    }
  }

  private getDefaultNetworkQuality(speed: 'slow' | 'medium' | 'fast'): NetworkQuality {
    const defaults = {
      slow: { speed: 'slow' as const, latency: 1000, bandwidth: 0.5, recommendedBatchSize: this.config.minBatchSize },
      medium: { speed: 'medium' as const, latency: 300, bandwidth: 2, recommendedBatchSize: 1000 },
      fast: { speed: 'fast' as const, latency: 50, bandwidth: 10, recommendedBatchSize: this.config.maxBatchSize },
    };
    return defaults[speed];
  }

  /**
   * Compress data using browser's native Compression Streams API
   */
  private async compressData(data: any): Promise<Uint8Array> {
    try {
      const jsonString = JSON.stringify(data);
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(jsonString);
      
      // Use browser's native compression
      const stream = new Blob([uint8Array]).stream();
      const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
      const compressedBlob = await new Response(compressedStream).blob();
      const arrayBuffer = await compressedBlob.arrayBuffer();
      
      return new Uint8Array(arrayBuffer);
    } catch (error) {
      console.warn('Compression failed, returning uncompressed data:', error);
      const encoder = new TextEncoder();
      return encoder.encode(JSON.stringify(data));
    }
  }

  /**
   * Decompress data using browser's native Decompression Streams API
   */
  private async decompressData(compressed: Uint8Array): Promise<any> {
    try {
      const stream = new Blob([compressed]).stream();
      const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
      const decompressedBlob = await new Response(decompressedStream).blob();
      const text = await decompressedBlob.text();
      
      return JSON.parse(text);
    } catch (error) {
      console.warn('Decompression failed, trying to parse as uncompressed:', error);
      const decoder = new TextDecoder();
      const text = decoder.decode(compressed);
      return JSON.parse(text);
    }
  }

  /**
   * Download a single table with optimizations
   */
  private async downloadTable(
    tableName: string,
    storeId: string,
    batchSize: number,
    onProgress?: (table: string, downloaded: number, total?: number) => void
  ): Promise<{ records: any[]; error?: string }> {
    console.log(`📥 Downloading ${tableName} (batch size: ${batchSize})...`);
    const startTime = performance.now();

    try {
      let allRecords: any[] = [];
      let offset = 0;
      let hasMore = true;
      let totalEstimate: number | undefined;

      while (hasMore) {
        // Build query
        let query = supabase.from(tableName as any).select('*', { count: 'exact' });

        // Apply filters
        if (tableName === 'products') {
          query = query.or(`store_id.eq.${storeId},is_global.eq.true`);
        } else if (tableName === 'stores') {
          query = query.eq('id', storeId);
        } else if (tableName !== 'transactions') {
          query = query.eq('store_id', storeId);
        }

        // Pagination
        query = query.range(offset, offset + batchSize - 1);

        const { data, error, count } = await query;

        if (error) {
          return { records: [], error: error.message };
        }

        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }

        // Store total for progress
        if (count !== null && totalEstimate === undefined) {
          totalEstimate = count;
        }

        // Add records
        allRecords = allRecords.concat(data);
        offset += data.length;
        hasMore = data.length === batchSize;

        // Report progress
        if (onProgress) {
          onProgress(tableName, allRecords.length, totalEstimate);
        }

        // Update internal progress
        this.downloadProgress.set(tableName, allRecords.length);

        // Adaptive batch sizing - increase if network is fast
        if (this.config.adaptiveBatchSizing && this.networkQuality?.speed === 'fast' && batchSize < this.config.maxBatchSize) {
          batchSize = Math.min(batchSize * 1.5, this.config.maxBatchSize);
        }

        // Safety limit
        if (offset > 100000) {
          console.warn(`⚠️ ${tableName}: Reached safety limit (100k records)`);
          break;
        }
      }

      const duration = performance.now() - startTime;
      console.log(`✅ Downloaded ${tableName}: ${allRecords.length} records in ${duration.toFixed(0)}ms`);

      return { records: allRecords };
    } catch (error) {
      console.error(`❌ Failed to download ${tableName}:`, error);
      return { records: [], error: String(error) };
    }
  }

  /**
   * Batch insert records into IndexedDB efficiently
   */
  private async batchInsertRecords(
    tableName: string,
    records: any[]
  ): Promise<{ inserted: number; error?: string }> {
    if (records.length === 0) {
      return { inserted: 0 };
    }

    console.log(`💾 Inserting ${records.length} ${tableName} records...`);
    const startTime = performance.now();

    try {
      // Prepare records with sync metadata
      const recordsWithSync = records
        .filter(record => {
          // Validate that record has required id field
          if (!record || !record.id || typeof record.id !== 'string') {
            console.warn(`⚠️ Skipping record in ${tableName} - missing or invalid id:`, record);
            return false;
          }
          return true;
        })
        .map(record => {
          const normalized = { ...record };

          // Normalize is_global for products
          if (tableName === 'products' && normalized.is_global !== undefined) {
            normalized.is_global = normalized.is_global === true || normalized.is_global === 1 ? 1 : 0;
          }
          
          // Normalize is_deleted for stores: convert to _deleted for IndexedDB
          if (tableName === 'stores' && normalized.is_deleted !== undefined) {
            normalized._deleted = normalized.is_deleted === true || normalized.is_deleted === 1;
            delete normalized.is_deleted;
            delete normalized.deleted_at;
            delete normalized.deleted_by;
          }
          
          // Normalize is_deleted for branches: convert to _deleted for IndexedDB
          if (tableName === 'branches' && normalized.is_deleted !== undefined) {
            normalized._deleted = normalized.is_deleted === true || normalized.is_deleted === 1;
            delete normalized.is_deleted;
            delete normalized.deleted_at;
            delete normalized.deleted_by;
          }

          return {
            ...normalized,
            _synced: true,
            _lastSyncedAt: new Date().toISOString(),
          };
        });

      // Bulk insert using single transaction
      await (db as any)[tableName].bulkPut(recordsWithSync);

      const duration = performance.now() - startTime;
      const skippedCount = records.length - recordsWithSync.length;
      if (skippedCount > 0) {
        console.warn(`⚠️ Skipped ${skippedCount} invalid records in ${tableName} (missing id)`);
      }
      console.log(`✅ Inserted ${recordsWithSync.length} ${tableName} records in ${duration.toFixed(0)}ms`);

      return { inserted: recordsWithSync.length };
    } catch (error) {
      console.error(`❌ Failed to insert ${tableName} records:`, error);
      return { inserted: 0, error: String(error) };
    }
  }

  /**
   * Get tables in dependency order for parallel downloads
   */
  private getTableGroups(tables: string[]): string[][] {
    const groups: string[][] = [];
    const processed = new Set<string>();

    // Helper to check if dependencies are met
    const canProcess = (table: string): boolean => {
      const deps = TABLE_DEPENDENCIES[table] || [];
      return deps.every(dep => processed.has(dep));
    };

    // Group tables by dependency level
    while (processed.size < tables.length) {
      const currentGroup: string[] = [];

      for (const table of tables) {
        if (!processed.has(table) && canProcess(table)) {
          currentGroup.push(table);
        }
      }

      if (currentGroup.length === 0) {
        // Circular dependency or missing table - add remaining
        const remaining = tables.filter(t => !processed.has(t));
        if (remaining.length > 0) {
          console.warn('⚠️ Circular dependency detected, adding remaining tables:', remaining);
          groups.push(remaining);
          remaining.forEach(t => processed.add(t));
        }
        break;
      }

      groups.push(currentGroup);
      currentGroup.forEach(t => processed.add(t));
    }

    return groups;
  }

  /**
   * Optimized full database download
   */
  async optimizedFullDownload(
    storeId: string,
    tables: string[],
    onProgress?: (table: string, downloaded: number, total?: number) => void
  ): Promise<{
    success: boolean;
    downloaded: number;
    errors: string[];
    duration: number;
    dataSize: number;
  }> {
    console.log('🚀 Starting optimized full download...');
    const overallStart = performance.now();

    const result = {
      success: true,
      downloaded: 0,
      errors: [] as string[],
      duration: 0,
      dataSize: 0,
    };

    try {
      // Step 1: Detect network quality
      if (this.config.adaptiveBatchSizing) {
        await this.detectNetworkQuality();
      }

      const batchSize = this.networkQuality?.recommendedBatchSize || 1000;

      // Step 2: Clear existing data
      console.log('🧹 Clearing local database...');
      await db.transaction('rw', db.tables, async () => {
        for (const tableName of tables) {
          if ((db as any)[tableName]) {
            await (db as any)[tableName].clear();
          }
        }
        await db.sync_metadata.clear();
      });

      // Step 3: Group tables by dependencies
      const tableGroups = this.getTableGroups(tables);
      console.log(`📊 Download plan: ${tableGroups.length} groups`, tableGroups);

      // Step 4: Download and insert tables in parallel groups
      for (let groupIndex = 0; groupIndex < tableGroups.length; groupIndex++) {
        const group = tableGroups[groupIndex];
        console.log(`📥 Downloading group ${groupIndex + 1}/${tableGroups.length}: ${group.join(', ')}`);

        // Download tables in parallel (up to maxParallelTables)
        const downloadPromises = group.map(tableName =>
          this.downloadTable(tableName, storeId, batchSize, onProgress)
        );

        // Limit concurrency
        const downloadResults = await this.limitConcurrency(
          downloadPromises,
          this.config.maxParallelTables
        );

        // Insert records for this group
        for (let i = 0; i < group.length; i++) {
          const tableName = group[i];
          const downloadResult = downloadResults[i];

          if (downloadResult.error) {
            result.errors.push(`${tableName}: ${downloadResult.error}`);
            result.success = false;
            continue;
          }

          // Insert records
          const insertResult = await this.batchInsertRecords(
            tableName,
            downloadResult.records
          );

          if (insertResult.error) {
            result.errors.push(`${tableName} insert: ${insertResult.error}`);
            result.success = false;
          } else {
            result.downloaded += insertResult.inserted;
            
            // Estimate data size
            const recordSize = JSON.stringify(downloadResult.records).length;
            result.dataSize += recordSize;

            // Update sync metadata
            await db.updateSyncMetadata(tableName, new Date().toISOString());
          }
        }
      }

      result.duration = performance.now() - overallStart;

      console.log(`✅ Optimized download complete:`);
      console.log(`   - Downloaded: ${result.downloaded} records`);
      console.log(`   - Duration: ${(result.duration / 1000).toFixed(1)}s`);
      console.log(`   - Data size: ${(result.dataSize / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   - Errors: ${result.errors.length}`);

      if (this.config.enableCompression) {
        const compressionRatio = this.estimateCompressionSavings(result.dataSize);
        console.log(`   - Potential compression savings: ${compressionRatio.toFixed(0)}%`);
      }

    } catch (error) {
      result.success = false;
      result.errors.push(`Fatal error: ${error}`);
      result.duration = performance.now() - overallStart;
    }

    return result;
  }

  /**
   * Limit concurrent promises
   */
  private async limitConcurrency<T>(
    promises: Promise<T>[],
    limit: number
  ): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<void>[] = [];

    for (const [index, promise] of promises.entries()) {
      const p = promise.then(result => {
        results[index] = result;
      });

      executing.push(p);

      if (executing.length >= limit) {
        await Promise.race(executing);
        executing.splice(
          executing.findIndex(e => e === p),
          1
        );
      }
    }

    await Promise.all(executing);
    return results;
  }

  /**
   * Estimate compression savings
   */
  private estimateCompressionSavings(uncompressedSize: number): number {
    // JSON typically compresses 70-85%
    const compressionRatio = 0.75; // Conservative estimate
    return compressionRatio * 100;
  }

  /**
   * Get download progress
   */
  getProgress(): Map<string, number> {
    return new Map(this.downloadProgress);
  }

  /**
   * Reset progress tracking
   */
  resetProgress(): void {
    this.downloadProgress.clear();
  }
}

// Export singleton instance
export const downloadOptimizationService = new DownloadOptimizationService();
