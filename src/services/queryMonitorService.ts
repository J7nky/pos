/**
 * Professional Query Monitor Service
 * Tracks database query costs, patterns, and optimization opportunities
 */

interface QueryMetrics {
  tableName: string;
  operation: string;
  count: number;
  totalCost: number;
  averageResponseTime: number;
  lastExecuted: Date;
  errorCount: number;
  cacheHitRate: number;
}

interface QueryAlert {
  type: 'cost' | 'frequency' | 'error' | 'performance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  recommendation: string;
  queryPattern: string;
  timestamp: Date;
}

export class QueryMonitorService {
  private static instance: QueryMonitorService;
  private metrics = new Map<string, QueryMetrics>();
  private alerts: QueryAlert[] = [];
  private costThresholds = {
    hourly: 1000,   // Alert if hourly cost exceeds 1000 units
    daily: 20000,   // Alert if daily cost exceeds 20000 units
    queryFrequency: 100, // Alert if same query runs >100 times/hour
  };

  public static getInstance(): QueryMonitorService {
    if (!QueryMonitorService.instance) {
      QueryMonitorService.instance = new QueryMonitorService();
    }
    return QueryMonitorService.instance;
  }

  /**
   * Track a database query execution
   */
  public trackQuery(
    tableName: string, 
    operation: string, 
    responseTime: number,
    cost: number = 1,
    cached: boolean = false,
    error?: Error
  ): void {
    const key = `${tableName}_${operation}`;
    const existing = this.metrics.get(key);

    if (existing) {
      existing.count += 1;
      existing.totalCost += cost;
      existing.averageResponseTime = (existing.averageResponseTime + responseTime) / 2;
      existing.lastExecuted = new Date();
      if (error) existing.errorCount += 1;
      if (cached) {
        existing.cacheHitRate = (existing.cacheHitRate * (existing.count - 1) + 1) / existing.count;
      } else {
        existing.cacheHitRate = (existing.cacheHitRate * (existing.count - 1)) / existing.count;
      }
    } else {
      this.metrics.set(key, {
        tableName,
        operation,
        count: 1,
        totalCost: cost,
        averageResponseTime: responseTime,
        lastExecuted: new Date(),
        errorCount: error ? 1 : 0,
        cacheHitRate: cached ? 1 : 0,
      });
    }

    // Check for alerts
    this.checkForAlerts(key, this.metrics.get(key)!);
  }

  /**
   * Get the most expensive queries
   */
  public getTopExpensiveQueries(limit: number = 10): QueryMetrics[] {
    return Array.from(this.metrics.values())
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, limit);
  }

  /**
   * Get the most frequent queries
   */
  public getMostFrequentQueries(limit: number = 10): QueryMetrics[] {
    return Array.from(this.metrics.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get queries with poor cache hit rates
   */
  public getPoorCacheHitQueries(threshold: number = 0.5): QueryMetrics[] {
    return Array.from(this.metrics.values())
      .filter(m => m.cacheHitRate < threshold && m.count > 10)
      .sort((a, b) => a.cacheHitRate - b.cacheHitRate);
  }

  /**
   * Get current alerts
   */
  public getAlerts(): QueryAlert[] {
    return this.alerts.slice(); // Return copy
  }

  /**
   * Get cost summary for a time period
   */
  public getCostSummary(hours: number = 24): {
    totalCost: number;
    queryCount: number;
    averageCostPerQuery: number;
    topCostDrivers: QueryMetrics[];
  } {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const recentMetrics = Array.from(this.metrics.values())
      .filter(m => m.lastExecuted >= cutoff);

    const totalCost = recentMetrics.reduce((sum, m) => sum + m.totalCost, 0);
    const queryCount = recentMetrics.reduce((sum, m) => sum + m.count, 0);

    return {
      totalCost,
      queryCount,
      averageCostPerQuery: queryCount > 0 ? totalCost / queryCount : 0,
      topCostDrivers: recentMetrics
        .sort((a, b) => b.totalCost - a.totalCost)
        .slice(0, 5),
    };
  }

  /**
   * Generate optimization recommendations
   */
  public getOptimizationRecommendations(): string[] {
    const recommendations: string[] = [];
    const expensiveQueries = this.getTopExpensiveQueries(5);
    const frequentQueries = this.getMostFrequentQueries(5);
    const poorCacheQueries = this.getPoorCacheHitQueries(0.3);

    // Expensive query recommendations
    if (expensiveQueries.length > 0) {
      recommendations.push(
        `🔥 Top cost driver: ${expensiveQueries[0].tableName}_${expensiveQueries[0].operation} ` +
        `(${expensiveQueries[0].totalCost} cost units). Consider adding indexes or reducing query frequency.`
      );
    }

    // Frequent query recommendations
    if (frequentQueries.length > 0 && frequentQueries[0].count > 50) {
      recommendations.push(
        `⚡ High frequency query: ${frequentQueries[0].tableName}_${frequentQueries[0].operation} ` +
        `(${frequentQueries[0].count} executions). Consider caching or batching.`
      );
    }

    // Cache optimization recommendations
    if (poorCacheQueries.length > 0) {
      recommendations.push(
        `📊 Poor cache performance: ${poorCacheQueries[0].tableName}_${poorCacheQueries[0].operation} ` +
        `(${Math.round(poorCacheQueries[0].cacheHitRate * 100)}% hit rate). Review caching strategy.`
      );
    }

    return recommendations;
  }

  /**
   * Check for performance and cost alerts
   */
  private checkForAlerts(key: string, metrics: QueryMetrics): void {
    const now = new Date();

    // High frequency alert
    if (metrics.count > this.costThresholds.queryFrequency) {
      this.addAlert({
        type: 'frequency',
        severity: 'high',
        message: `High query frequency detected: ${key}`,
        recommendation: `Consider caching, batching, or reducing query frequency for ${key}`,
        queryPattern: key,
        timestamp: now,
      });
    }

    // High cost alert
    if (metrics.totalCost > this.costThresholds.hourly) {
      this.addAlert({
        type: 'cost',
        severity: 'critical',
        message: `High cost query detected: ${key}`,
        recommendation: `Optimize query or add caching for ${key} to reduce costs`,
        queryPattern: key,
        timestamp: now,
      });
    }

    // Error rate alert
    if (metrics.errorCount / metrics.count > 0.1) {
      this.addAlert({
        type: 'error',
        severity: 'medium',
        message: `High error rate for query: ${key}`,
        recommendation: `Investigate and fix errors in ${key} queries`,
        queryPattern: key,
        timestamp: now,
      });
    }

    // Performance alert
    if (metrics.averageResponseTime > 5000) { // 5 seconds
      this.addAlert({
        type: 'performance',
        severity: 'medium',
        message: `Slow query detected: ${key}`,
        recommendation: `Optimize performance for ${key} queries`,
        queryPattern: key,
        timestamp: now,
      });
    }
  }

  /**
   * Add an alert (with deduplication)
   */
  private addAlert(alert: QueryAlert): void {
    // Remove old alerts for the same query pattern
    this.alerts = this.alerts.filter(
      a => !(a.queryPattern === alert.queryPattern && a.type === alert.type)
    );

    this.alerts.push(alert);

    // Keep only recent alerts (last 24 hours)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.alerts = this.alerts.filter(a => a.timestamp >= cutoff);

    // Log critical alerts
    if (alert.severity === 'critical') {
      console.warn(`🚨 CRITICAL QUERY ALERT: ${alert.message} - ${alert.recommendation}`);
    }
  }

  /**
   * Reset metrics (for testing or periodic cleanup)
   */
  public resetMetrics(): void {
    this.metrics.clear();
    this.alerts = [];
  }

  /**
   * Export metrics for analysis
   */
  public exportMetrics(): {
    timestamp: Date;
    metrics: QueryMetrics[];
    alerts: QueryAlert[];
    summary: ReturnType<typeof this.getCostSummary>;
  } {
    return {
      timestamp: new Date(),
      metrics: Array.from(this.metrics.values()),
      alerts: this.getAlerts(),
      summary: this.getCostSummary(),
    };
  }
}

// Export singleton instance
export const queryMonitor = QueryMonitorService.getInstance();
