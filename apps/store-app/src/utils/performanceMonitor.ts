/**
 * PERFORMANCE MONITORING UTILITY
 * 
 * Provides performance profiling and monitoring capabilities.
 * Helps identify bottlenecks and optimize slow operations.
 * 
 * Features:
 * - Method execution timing
 * - Performance metrics collection
 * - Bottleneck detection
 * - Memory usage tracking
 * - Real-time performance alerts
 * 
 * Usage:
 * ```typescript
 * const result = await withPerformanceTracking(
 *   'calculateBalance',
 *   async () => await calculateBalanceFromTransactions(transactions)
 * );
 * 
 * // Or use decorator
 * @trackPerformance('balanceCalculation')
 * async calculateBalance() { ... }
 * ```
 */

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  memoryUsed?: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface PerformanceStats {
  name: string;
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  lastDuration: number;
  successRate: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface PerformanceAlert {
  name: string;
  type: 'slow' | 'error' | 'memory';
  message: string;
  duration?: number;
  threshold?: number;
  timestamp: number;
}

export class PerformanceMonitor {
  private static metrics: PerformanceMetric[] = [];
  private static alerts: PerformanceAlert[] = [];
  private static maxMetrics = 1000; // Keep last 1000 metrics
  private static slowThresholds: Record<string, number> = {};
  private static alertCallbacks: Array<(alert: PerformanceAlert) => void> = [];

  /**
   * Track execution time of an async operation
   */
  static async withTracking<T>(
    name: string,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = performance.now();
    const startMemory = this.getMemoryUsage();
    
    try {
      const result = await operation();
      const duration = performance.now() - startTime;
      
      this.recordMetric({
        name,
        duration,
        timestamp: Date.now(),
        memoryUsed: this.getMemoryUsage() - startMemory,
        success: true,
        metadata
      });

      this.checkForSlowOperation(name, duration);
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      this.recordMetric({
        name,
        duration,
        timestamp: Date.now(),
        memoryUsed: this.getMemoryUsage() - startMemory,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata
      });

      this.addAlert({
        name,
        type: 'error',
        message: `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now()
      });

      throw error;
    }
  }

  /**
   * Track execution time of a synchronous operation
   */
  static withSyncTracking<T>(
    name: string,
    operation: () => T,
    metadata?: Record<string, any>
  ): T {
    const startTime = performance.now();
    const startMemory = this.getMemoryUsage();
    
    try {
      const result = operation();
      const duration = performance.now() - startTime;
      
      this.recordMetric({
        name,
        duration,
        timestamp: Date.now(),
        memoryUsed: this.getMemoryUsage() - startMemory,
        success: true,
        metadata
      });

      this.checkForSlowOperation(name, duration);
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      this.recordMetric({
        name,
        duration,
        timestamp: Date.now(),
        memoryUsed: this.getMemoryUsage() - startMemory,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata
      });

      throw error;
    }
  }

  /**
   * Set threshold for slow operation alerts
   */
  static setSlowThreshold(operationName: string, milliseconds: number): void {
    this.slowThresholds[operationName] = milliseconds;
  }

  /**
   * Check if operation exceeded threshold
   */
  private static checkForSlowOperation(name: string, duration: number): void {
    const threshold = this.slowThresholds[name];
    if (threshold && duration > threshold) {
      this.addAlert({
        name,
        type: 'slow',
        message: `Operation exceeded threshold: ${duration.toFixed(2)}ms > ${threshold}ms`,
        duration,
        threshold,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Record a performance metric
   */
  private static recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);

    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  /**
   * Add a performance alert
   */
  private static addAlert(alert: PerformanceAlert): void {
    this.alerts.push(alert);
    
    // Keep only the last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    // Notify callbacks
    this.alertCallbacks.forEach(callback => callback(alert));
  }

  /**
   * Subscribe to performance alerts
   */
  static onAlert(callback: (alert: PerformanceAlert) => void): () => void {
    this.alertCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.alertCallbacks.indexOf(callback);
      if (index > -1) {
        this.alertCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get statistics for a specific operation
   */
  static getStats(operationName: string): PerformanceStats | null {
    const metrics = this.metrics.filter(m => m.name === operationName);
    if (metrics.length === 0) return null;

    const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
    const successCount = metrics.filter(m => m.success).length;

    return {
      name: operationName,
      count: metrics.length,
      totalDuration: durations.reduce((sum, d) => sum + d, 0),
      avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      lastDuration: metrics[metrics.length - 1].duration,
      successRate: successCount / metrics.length,
      p50: durations[Math.floor(durations.length * 0.5)],
      p95: durations[Math.floor(durations.length * 0.95)],
      p99: durations[Math.floor(durations.length * 0.99)]
    };
  }

  /**
   * Get all recorded metrics
   */
  static getAllMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Get metrics for a specific operation
   */
  static getMetrics(operationName: string): PerformanceMetric[] {
    return this.metrics.filter(m => m.name === operationName);
  }

  /**
   * Get all alerts
   */
  static getAlerts(): PerformanceAlert[] {
    return [...this.alerts];
  }

  /**
   * Get statistics for all operations
   */
  static getAllStats(): PerformanceStats[] {
    const operationNames = [...new Set(this.metrics.map(m => m.name))];
    return operationNames
      .map(name => this.getStats(name))
      .filter((stats): stats is PerformanceStats => stats !== null);
  }

  /**
   * Get slowest operations
   */
  static getSlowestOperations(limit: number = 10): PerformanceStats[] {
    return this.getAllStats()
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, limit);
  }

  /**
   * Get operations with lowest success rate
   */
  static getMostFailedOperations(limit: number = 10): PerformanceStats[] {
    return this.getAllStats()
      .sort((a, b) => a.successRate - b.successRate)
      .slice(0, limit);
  }

  /**
   * Clear all metrics
   */
  static clear(): void {
    this.metrics = [];
    this.alerts = [];
  }

  /**
   * Clear metrics older than specified milliseconds
   */
  static clearOld(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    const beforeCount = this.metrics.length;
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
    return beforeCount - this.metrics.length;
  }

  /**
   * Get memory usage (if available)
   */
  private static getMemoryUsage(): number {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  }

  /**
   * Generate performance report
   */
  static generateReport(): string {
    const stats = this.getAllStats();
    const slowest = this.getSlowestOperations(5);
    const failed = this.getMostFailedOperations(5);
    const recentAlerts = this.alerts.slice(-10);

    let report = '=== PERFORMANCE REPORT ===\n\n';
    
    report += `Total Operations Tracked: ${stats.reduce((sum, s) => sum + s.count, 0)}\n`;
    report += `Unique Operations: ${stats.length}\n`;
    report += `Total Alerts: ${this.alerts.length}\n\n`;

    if (slowest.length > 0) {
      report += '--- SLOWEST OPERATIONS ---\n';
      slowest.forEach((stat, i) => {
        report += `${i + 1}. ${stat.name}\n`;
        report += `   Avg: ${stat.avgDuration.toFixed(2)}ms, `;
        report += `Max: ${stat.maxDuration.toFixed(2)}ms, `;
        report += `P95: ${stat.p95.toFixed(2)}ms, `;
        report += `Count: ${stat.count}\n`;
      });
      report += '\n';
    }

    if (failed.length > 0) {
      report += '--- OPERATIONS WITH ERRORS ---\n';
      failed.forEach((stat, i) => {
        if (stat.successRate < 1) {
          report += `${i + 1}. ${stat.name}\n`;
          report += `   Success Rate: ${(stat.successRate * 100).toFixed(1)}%, `;
          report += `Count: ${stat.count}\n`;
        }
      });
      report += '\n';
    }

    if (recentAlerts.length > 0) {
      report += '--- RECENT ALERTS ---\n';
      recentAlerts.forEach((alert, i) => {
        report += `${i + 1}. [${alert.type.toUpperCase()}] ${alert.name}\n`;
        report += `   ${alert.message}\n`;
      });
    }

    return report;
  }

  /**
   * Log performance report to console
   */
  static logReport(): void {
    console.log(this.generateReport());
  }

  /**
   * Export metrics as JSON
   */
  static exportMetrics(): string {
    return JSON.stringify({
      metrics: this.metrics,
      stats: this.getAllStats(),
      alerts: this.alerts,
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  /**
   * Get performance summary
   */
  static getSummary(): {
    totalOperations: number;
    uniqueOperations: number;
    avgDuration: number;
    totalAlerts: number;
    slowAlerts: number;
    errorAlerts: number;
  } {
    const stats = this.getAllStats();
    const totalOps = stats.reduce((sum, s) => sum + s.count, 0);
    const avgDuration = stats.length > 0
      ? stats.reduce((sum, s) => sum + s.avgDuration, 0) / stats.length
      : 0;

    return {
      totalOperations: totalOps,
      uniqueOperations: stats.length,
      avgDuration,
      totalAlerts: this.alerts.length,
      slowAlerts: this.alerts.filter(a => a.type === 'slow').length,
      errorAlerts: this.alerts.filter(a => a.type === 'error').length
    };
  }
}

/**
 * Decorator for tracking method performance
 */
export function trackPerformance(operationName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const name = operationName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      return PerformanceMonitor.withTracking(
        name,
        () => originalMethod.apply(this, args)
      );
    };

    return descriptor;
  };
}

/**
 * Shorthand function for performance tracking
 */
export async function withPerformanceTracking<T>(
  name: string,
  operation: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  return PerformanceMonitor.withTracking(name, operation, metadata);
}

/**
 * Measure render time of a React component
 */
export function measureRenderTime(componentName: string) {
  const startTime = performance.now();
  
  return () => {
    const duration = performance.now() - startTime;
    PerformanceMonitor.withSyncTracking(
      `render:${componentName}`,
      () => duration
    );
  };
}

/**
 * Set common slow thresholds
 */
export function setupCommonThresholds() {
  // Database operations
  PerformanceMonitor.setSlowThreshold('db:query', 100);
  PerformanceMonitor.setSlowThreshold('db:insert', 50);
  PerformanceMonitor.setSlowThreshold('db:update', 50);
  PerformanceMonitor.setSlowThreshold('db:delete', 50);
  
  // Balance calculations
  PerformanceMonitor.setSlowThreshold('balance:calculate', 200);
  PerformanceMonitor.setSlowThreshold('balance:verify', 150);
  
  // Transaction operations
  PerformanceMonitor.setSlowThreshold('transaction:create', 100);
  PerformanceMonitor.setSlowThreshold('transaction:update', 75);
  
  // Sync operations
  PerformanceMonitor.setSlowThreshold('sync:push', 500);
  PerformanceMonitor.setSlowThreshold('sync:pull', 1000);
  
  // Rendering
  PerformanceMonitor.setSlowThreshold('render', 16); // 60fps = 16ms per frame
}

