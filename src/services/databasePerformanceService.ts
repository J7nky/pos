import { db } from '../lib/db';
import { databaseConnectionService } from './databaseConnectionService';

export interface QueryMetrics {
  queryId: string;
  tableName: string;
  operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  startTime: number;
  endTime: number;
  duration: number;
  recordCount: number;
  success: boolean;
  error?: string;
  cacheHit?: boolean;
  indexUsed?: string[];
}

export interface TableMetrics {
  tableName: string;
  recordCount: number;
  sizeBytes: number;
  lastAccessed: Date;
  accessCount: number;
  averageQueryTime: number;
  slowestQuery: number;
  errorRate: number;
  indexEfficiency: number;
}

export interface DatabaseMetrics {
  totalQueries: number;
  averageQueryTime: number;
  slowestQuery: number;
  errorRate: number;
  cacheHitRate: number;
  totalRecords: number;
  totalSizeBytes: number;
  connectionPoolStatus: {
    total: number;
    healthy: number;
    unhealthy: number;
  };
  tableMetrics: TableMetrics[];
  recentQueries: QueryMetrics[];
  performanceScore: number; // 0-100
}

export interface PerformanceAlert {
  id: string;
  type: 'slow_query' | 'high_error_rate' | 'low_cache_hit_rate' | 'connection_issues' | 'large_table';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  resolved: boolean;
  data?: any;
}

export interface PerformanceConfig {
  slowQueryThreshold: number; // ms
  errorRateThreshold: number; // percentage
  cacheHitRateThreshold: number; // percentage
  largeTableThreshold: number; // MB
  maxQueriesToTrack: number;
  alertRetentionDays: number;
}

export class DatabasePerformanceService {
  private static instance: DatabasePerformanceService;
  private queryMetrics: QueryMetrics[] = [];
  private tableMetrics: Map<string, TableMetrics> = new Map();
  private alerts: PerformanceAlert[] = [];
  private config: PerformanceConfig;
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;

  private constructor() {
    this.config = {
      slowQueryThreshold: 1000, // 1 second
      errorRateThreshold: 5, // 5%
      cacheHitRateThreshold: 80, // 80%
      largeTableThreshold: 10, // 10MB
      maxQueriesToTrack: 1000,
      alertRetentionDays: 7
    };
  }

  public static getInstance(): DatabasePerformanceService {
    if (!DatabasePerformanceService.instance) {
      DatabasePerformanceService.instance = new DatabasePerformanceService();
    }
    return DatabasePerformanceService.instance;
  }

  /**
   * Start performance monitoring
   */
  public startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    console.log('📊 Starting database performance monitoring...');

    // Monitor every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      await this.updateTableMetrics();
      await this.checkPerformanceAlerts();
      await this.cleanupOldData();
    }, 30000);

    // Initial metrics update
    this.updateTableMetrics();
  }

  /**
   * Stop performance monitoring
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    console.log('📊 Database performance monitoring stopped');
  }

  /**
   * Track a database query
   */
  public trackQuery(
    tableName: string,
    operation: QueryMetrics['operation'],
    queryFn: () => Promise<any>,
    options: {
      recordCount?: number;
      cacheHit?: boolean;
      indexUsed?: string[];
    } = {}
  ): Promise<any> {
    const queryId = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();

    return queryFn()
      .then(async (result) => {
        const endTime = performance.now();
        const duration = endTime - startTime;

        const metrics: QueryMetrics = {
          queryId,
          tableName,
          operation,
          startTime,
          endTime,
          duration,
          recordCount: options.recordCount || (Array.isArray(result) ? result.length : 1),
          success: true,
          cacheHit: options.cacheHit,
          indexUsed: options.indexUsed
        };

        this.addQueryMetrics(metrics);
        return result;
      })
      .catch(async (error) => {
        const endTime = performance.now();
        const duration = endTime - startTime;

        const metrics: QueryMetrics = {
          queryId,
          tableName,
          operation,
          startTime,
          endTime,
          duration,
          recordCount: 0,
          success: false,
          error: error.message,
          cacheHit: options.cacheHit,
          indexUsed: options.indexUsed
        };

        this.addQueryMetrics(metrics);
        throw error;
      });
  }

  /**
   * Add query metrics to tracking
   */
  private addQueryMetrics(metrics: QueryMetrics): void {
    this.queryMetrics.push(metrics);

    // Keep only the most recent queries
    if (this.queryMetrics.length > this.config.maxQueriesToTrack) {
      this.queryMetrics = this.queryMetrics.slice(-this.config.maxQueriesToTrack);
    }

    // Update table metrics
    this.updateTableMetricsForQuery(metrics);
  }

  /**
   * Update table metrics for a specific query
   */
  private updateTableMetricsForQuery(metrics: QueryMetrics): void {
    const existing = this.tableMetrics.get(metrics.tableName) || {
      tableName: metrics.tableName,
      recordCount: 0,
      sizeBytes: 0,
      lastAccessed: new Date(),
      accessCount: 0,
      averageQueryTime: 0,
      slowestQuery: 0,
      errorRate: 0,
      indexEfficiency: 0
    };

    existing.accessCount++;
    existing.lastAccessed = new Date();
    
    // Update average query time
    const totalTime = existing.averageQueryTime * (existing.accessCount - 1) + metrics.duration;
    existing.averageQueryTime = totalTime / existing.accessCount;

    // Update slowest query
    if (metrics.duration > existing.slowestQuery) {
      existing.slowestQuery = metrics.duration;
    }

    // Update error rate
    const recentQueries = this.queryMetrics
      .filter(q => q.tableName === metrics.tableName)
      .slice(-100); // Last 100 queries
    const errorCount = recentQueries.filter(q => !q.success).length;
    existing.errorRate = (errorCount / recentQueries.length) * 100;

    this.tableMetrics.set(metrics.tableName, existing);
  }

  /**
   * Update table metrics from database
   */
  private async updateTableMetrics(): Promise<void> {
    try {
      const tableNames = [
        'stores', 'products', 'suppliers', 'customers', 'inventory_items',
        'transactions', 'inventory_bills', 'bills', 'bill_line_items',
        'bill_audit_logs', 'cash_drawer_accounts', 'cash_drawer_sessions',
        'exchange_rates', 'sync_metadata', 'pending_syncs'
      ];

      for (const tableName of tableNames) {
        try {
          const table = (db as any)[tableName];
          if (table) {
            const recordCount = await table.count();
            const sizeBytes = await this.estimateTableSize(tableName);
            
            const existing = this.tableMetrics.get(tableName) || {
              tableName,
              recordCount: 0,
              sizeBytes: 0,
              lastAccessed: new Date(),
              accessCount: 0,
              averageQueryTime: 0,
              slowestQuery: 0,
              errorRate: 0,
              indexEfficiency: 0
            };

            existing.recordCount = recordCount;
            existing.sizeBytes = sizeBytes;

            this.tableMetrics.set(tableName, existing);
          }
        } catch (error) {
          console.warn(`Failed to update metrics for table ${tableName}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to update table metrics:', error);
    }
  }

  /**
   * Estimate table size in bytes
   */
  private async estimateTableSize(tableName: string): Promise<number> {
    try {
      const table = (db as any)[tableName];
      if (!table) return 0;

      // Sample a few records to estimate size
      const sample = await table.limit(10).toArray();
      if (sample.length === 0) return 0;

      const sampleSize = JSON.stringify(sample).length;
      const recordCount = await table.count();
      const averageRecordSize = sampleSize / sample.length;
      
      return Math.round(recordCount * averageRecordSize);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Check for performance alerts
   */
  private async checkPerformanceAlerts(): Promise<void> {
    const recentQueries = this.queryMetrics.slice(-100);
    
    // Check for slow queries
    const slowQueries = recentQueries.filter(q => q.duration > this.config.slowQueryThreshold);
    if (slowQueries.length > 0) {
      this.createAlert({
        type: 'slow_query',
        severity: slowQueries.length > 10 ? 'high' : 'medium',
        message: `${slowQueries.length} slow queries detected (${this.config.slowQueryThreshold}ms+)`,
        data: { slowQueries: slowQueries.slice(0, 5) }
      });
    }

    // Check error rate
    const errorRate = (recentQueries.filter(q => !q.success).length / recentQueries.length) * 100;
    if (errorRate > this.config.errorRateThreshold) {
      this.createAlert({
        type: 'high_error_rate',
        severity: errorRate > 20 ? 'critical' : 'high',
        message: `High error rate detected: ${errorRate.toFixed(1)}%`,
        data: { errorRate }
      });
    }

    // Check cache hit rate
    const cacheQueries = recentQueries.filter(q => q.cacheHit !== undefined);
    if (cacheQueries.length > 10) {
      const cacheHitRate = (cacheQueries.filter(q => q.cacheHit).length / cacheQueries.length) * 100;
      if (cacheHitRate < this.config.cacheHitRateThreshold) {
        this.createAlert({
          type: 'low_cache_hit_rate',
          severity: cacheHitRate < 50 ? 'high' : 'medium',
          message: `Low cache hit rate: ${cacheHitRate.toFixed(1)}%`,
          data: { cacheHitRate }
        });
      }
    }

    // Check for large tables
    for (const [tableName, metrics] of this.tableMetrics) {
      const sizeMB = metrics.sizeBytes / (1024 * 1024);
      if (sizeMB > this.config.largeTableThreshold) {
        this.createAlert({
          type: 'large_table',
          severity: sizeMB > 100 ? 'high' : 'medium',
          message: `Large table detected: ${tableName} (${sizeMB.toFixed(1)}MB)`,
          data: { tableName, sizeMB }
        });
      }
    }

    // Check connection pool status
    const poolStatus = databaseConnectionService.getPoolStatus();
    if (poolStatus.unhealthy > 0) {
      this.createAlert({
        type: 'connection_issues',
        severity: poolStatus.unhealthy > poolStatus.total / 2 ? 'critical' : 'high',
        message: `${poolStatus.unhealthy} unhealthy connections in pool`,
        data: { poolStatus }
      });
    }
  }

  /**
   * Create a performance alert
   */
  private createAlert(alert: Omit<PerformanceAlert, 'id' | 'timestamp' | 'resolved'>): void {
    const newAlert: PerformanceAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      resolved: false,
      ...alert
    };

    // Check if similar alert already exists
    const existingAlert = this.alerts.find(a => 
      a.type === alert.type && 
      !a.resolved && 
      Date.now() - a.timestamp.getTime() < 300000 // 5 minutes
    );

    if (!existingAlert) {
      this.alerts.push(newAlert);
      console.warn(`🚨 Performance Alert [${alert.severity.toUpperCase()}]: ${alert.message}`);
    }
  }

  /**
   * Clean up old data
   */
  private async cleanupOldData(): Promise<void> {
    const cutoffTime = Date.now() - (this.config.alertRetentionDays * 24 * 60 * 60 * 1000);
    
    // Remove old alerts
    this.alerts = this.alerts.filter(alert => alert.timestamp.getTime() > cutoffTime);
    
    // Remove old query metrics (keep last 1000)
    if (this.queryMetrics.length > this.config.maxQueriesToTrack) {
      this.queryMetrics = this.queryMetrics.slice(-this.config.maxQueriesToTrack);
    }
  }

  /**
   * Get comprehensive database metrics
   */
  public getDatabaseMetrics(): DatabaseMetrics {
    const recentQueries = this.queryMetrics.slice(-100);
    const totalQueries = this.queryMetrics.length;
    
    const averageQueryTime = recentQueries.length > 0 
      ? recentQueries.reduce((sum, q) => sum + q.duration, 0) / recentQueries.length 
      : 0;

    const slowestQuery = recentQueries.length > 0 
      ? Math.max(...recentQueries.map(q => q.duration)) 
      : 0;

    const errorRate = recentQueries.length > 0 
      ? (recentQueries.filter(q => !q.success).length / recentQueries.length) * 100 
      : 0;

    const cacheQueries = recentQueries.filter(q => q.cacheHit !== undefined);
    const cacheHitRate = cacheQueries.length > 0 
      ? (cacheQueries.filter(q => q.cacheHit).length / cacheQueries.length) * 100 
      : 0;

    const totalRecords = Array.from(this.tableMetrics.values())
      .reduce((sum, metrics) => sum + metrics.recordCount, 0);

    const totalSizeBytes = Array.from(this.tableMetrics.values())
      .reduce((sum, metrics) => sum + metrics.sizeBytes, 0);

    const connectionPoolStatus = databaseConnectionService.getPoolStatus();

    // Calculate performance score (0-100)
    let performanceScore = 100;
    if (averageQueryTime > 1000) performanceScore -= 20;
    if (errorRate > 5) performanceScore -= 30;
    if (cacheHitRate < 80) performanceScore -= 15;
    if (connectionPoolStatus.unhealthy > 0) performanceScore -= 25;
    performanceScore = Math.max(0, performanceScore);

    return {
      totalQueries,
      averageQueryTime,
      slowestQuery,
      errorRate,
      cacheHitRate,
      totalRecords,
      totalSizeBytes,
      connectionPoolStatus,
      tableMetrics: Array.from(this.tableMetrics.values()),
      recentQueries: recentQueries.slice(-20),
      performanceScore
    };
  }

  /**
   * Get performance alerts
   */
  public getAlerts(): PerformanceAlert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Resolve an alert
   */
  public resolveAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
    }
  }

  /**
   * Get table-specific metrics
   */
  public getTableMetrics(tableName: string): TableMetrics | undefined {
    return this.tableMetrics.get(tableName);
  }

  /**
   * Get query performance statistics
   */
  public getQueryStats(): {
    totalQueries: number;
    averageDuration: number;
    slowestQuery: number;
    errorRate: number;
    topSlowQueries: QueryMetrics[];
  } {
    const recentQueries = this.queryMetrics.slice(-100);
    
    return {
      totalQueries: this.queryMetrics.length,
      averageDuration: recentQueries.length > 0 
        ? recentQueries.reduce((sum, q) => sum + q.duration, 0) / recentQueries.length 
        : 0,
      slowestQuery: recentQueries.length > 0 
        ? Math.max(...recentQueries.map(q => q.duration)) 
        : 0,
      errorRate: recentQueries.length > 0 
        ? (recentQueries.filter(q => !q.success).length / recentQueries.length) * 100 
        : 0,
      topSlowQueries: recentQueries
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10)
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  public getConfig(): PerformanceConfig {
    return { ...this.config };
  }

  /**
   * Reset all metrics
   */
  public resetMetrics(): void {
    this.queryMetrics = [];
    this.tableMetrics.clear();
    this.alerts = [];
    console.log('📊 Database performance metrics reset');
  }
}

export const databasePerformanceService = DatabasePerformanceService.getInstance();

