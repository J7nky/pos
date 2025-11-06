import { auditLogService } from './auditLogService';
import { enhancedTransactionService } from './enhancedTransactionService';
import { dataSyncService } from './dataSyncService';
import { 
  Customer, 
  Supplier, 
  Transaction, 
  Sale, 
  SaleItem, 
  InventoryItem,
  AccountsReceivable,
  AccountsPayable
} from '../types';

export interface ComprehensiveLogEntry {
  id: string;
  timestamp: string;
  category: 'financial' | 'inventory' | 'customer' | 'supplier' | 'system' | 'audit';
  subcategory: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  entity: {
    type: string;
    id: string;
    name?: string;
  };
  user: {
    id: string;
    email?: string;
    name?: string;
  };
  changes?: {
    before?: any;
    after?: any;
    fields?: string[];
  };
  financial?: {
    amount?: number;
    currency?: string;
    balanceChange?: {
      before: number;
      after: number;
      entityType: 'customer' | 'supplier' | 'cash_drawer';
    };
  };
  metadata: {
    correlationId?: string;
    sessionId?: string;
    source: string;
    module: string;
    tags: string[];
  };
  relatedEntities?: Array<{
    type: string;
    id: string;
    name?: string;
  }>;
}

export interface LoggingContext {
  userId: string;
  userEmail?: string;
  userName?: string;
  sessionId?: string;
  source?: 'web' | 'mobile' | 'api' | 'system';
  module: string;
  correlationId?: string;
}

export interface ActivitySummary {
  period: {
    start: string;
    end: string;
  };
  totals: {
    activities: number;
    users: number;
    entities: number;
    errors: number;
  };
  breakdown: {
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    byUser: Record<string, number>;
    byHour: Record<string, number>;
  };
  trends: {
    activityGrowth: number;
    errorRate: number;
    peakHours: string[];
  };
  financialImpact: {
    totalTransactionValue: number;
    balanceChanges: number;
    accountsAffected: number;
  };
  alerts: Array<{
    type: 'security' | 'integrity' | 'performance' | 'business';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    count: number;
  }>;
}

export class ComprehensiveLoggingService {
  private static instance: ComprehensiveLoggingService;
  private logs: ComprehensiveLogEntry[] = [];
  private subscribers: Array<(entry: ComprehensiveLogEntry) => void> = [];

  private constructor() {
    this.loadLogsFromStorage();
    this.initializeEventListeners();
  }

  public static getInstance(): ComprehensiveLoggingService {
    if (!ComprehensiveLoggingService.instance) {
      ComprehensiveLoggingService.instance = new ComprehensiveLoggingService();
    }
    return ComprehensiveLoggingService.instance;
  }

  private loadLogsFromStorage(): void {
    try {
      const stored = localStorage.getItem('comprehensive_logs');
      this.logs = stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading comprehensive logs:', error);
      this.logs = [];
    }
  }

  private saveLogsToStorage(): void {
    try {
      // Keep only the last 10,000 entries to prevent storage overflow
      const logsToSave = this.logs.slice(-10000);
      localStorage.setItem('comprehensive_logs', JSON.stringify(logsToSave));
      this.logs = logsToSave;
    } catch (error) {
      console.error('Error saving comprehensive logs:', error);
    }
  }

  private initializeEventListeners(): void {
    // Listen for audit log events
    window.addEventListener('audit-log-created', (event: any) => {
      const auditEntry = event.detail;
      this.createComprehensiveEntry(auditEntry);
    });
  }

  private createComprehensiveEntry(auditEntry: any): void {
    const comprehensiveEntry: ComprehensiveLogEntry = {
      id: `comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: auditEntry.timestamp,
      category: this.mapToCategory(auditEntry.entityType, auditEntry.action),
      subcategory: auditEntry.action,
      severity: auditEntry.severity,
      title: this.generateTitle(auditEntry),
      description: auditEntry.description,
      entity: {
        type: auditEntry.entityType,
        id: auditEntry.entityId,
        name: auditEntry.entityName
      },
      user: {
        id: auditEntry.userId,
        email: auditEntry.userEmail,
        name: auditEntry.userName
      },
      changes: auditEntry.previousData || auditEntry.newData ? {
        before: auditEntry.previousData,
        after: auditEntry.newData,
        fields: auditEntry.changedFields
      } : undefined,
      financial: auditEntry.balanceChange ? {
        balanceChange: {
          before: auditEntry.balanceChange.balanceBefore,
          after: auditEntry.balanceChange.balanceAfter,
          entityType: auditEntry.balanceChange.entityType
        },
        currency: auditEntry.balanceChange.currency
      } : undefined,
      metadata: {
        correlationId: auditEntry.metadata.correlationId,
        sessionId: auditEntry.metadata.sessionId,
        source: auditEntry.metadata.source,
        module: auditEntry.metadata.module,
        tags: auditEntry.tags
      },
      relatedEntities: auditEntry.relatedTransactions?.map((id: string) => ({
        type: 'transaction',
        id
      }))
    };

    this.logs.push(comprehensiveEntry);
    this.saveLogsToStorage();
    this.notifySubscribers(comprehensiveEntry);
  }

  private mapToCategory(entityType: string, action: string): ComprehensiveLogEntry['category'] {
    if (action.includes('payment') || action.includes('transaction') || action.includes('balance')) {
      return 'financial';
    }
    if (action.includes('inventory') || action.includes('stock')) {
      return 'inventory';
    }
    if (entityType === 'customer' || action.includes('customer')) {
      return 'customer';
    }
    if (entityType === 'supplier' || action.includes('supplier')) {
      return 'supplier';
    }
    if (action.includes('sync') || action.includes('backup') || action.includes('system')) {
      return 'system';
    }
    return 'audit';
  }

  private generateTitle(auditEntry: any): string {
    const actionMap: Record<string, string> = {
      'customer_payment_received': 'Customer Payment Received',
      'supplier_payment_sent': 'Supplier Payment Sent',
      'sale_created': 'Sale Completed',
      'inventory_received': 'Inventory Received',
      'customer_created': 'New Customer Added',
      'supplier_created': 'New Supplier Added',
      'customer_balance_adjusted': 'Customer Balance Updated',
      'supplier_balance_adjusted': 'Supplier Balance Updated',
      'receivable_updated': 'Account Receivable Updated',
      'payable_updated': 'Account Payable Updated'
    };

    return actionMap[auditEntry.action] || auditEntry.action.replace(/_/g, ' ').toUpperCase();
  }

  private notifySubscribers(entry: ComprehensiveLogEntry): void {
    this.subscribers.forEach(callback => {
      try {
        callback(entry);
      } catch (error) {
        console.error('Error notifying subscriber:', error);
      }
    });
  }

  // Public logging methods
  public logCustomerActivity(params: {
    action: string;
    customerId: string;
    customerName: string;
    description: string;
    context: LoggingContext;
    amount?: number;
    currency?: string;
    balanceChange?: { before: number; after: number };
    severity?: ComprehensiveLogEntry['severity'];
  }): string {
    const entry: ComprehensiveLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      category: 'customer',
      subcategory: params.action,
      severity: params.severity || 'medium',
      title: `Customer ${params.action.replace(/_/g, ' ')}`,
      description: params.description,
      entity: {
        type: 'customer',
        id: params.customerId,
        name: params.customerName
      },
      user: {
        id: params.context.userId,
        email: params.context.userEmail,
        name: params.context.userName
      },
      financial: params.amount ? {
        amount: params.amount,
        currency: params.currency,
        balanceChange: params.balanceChange ? {
          before: params.balanceChange.before,
          after: params.balanceChange.after,
          entityType: 'customer'
        } : undefined
      } : undefined,
      metadata: {
        correlationId: params.context.correlationId,
        sessionId: params.context.sessionId,
        source: params.context.source || 'web',
        module: params.context.module,
        tags: ['customer', params.action]
      }
    };

    this.logs.push(entry);
    this.saveLogsToStorage();
    this.notifySubscribers(entry);
    return entry.id;
  }

  public logFinancialActivity(params: {
    action: string;
    entityType: string;
    entityId: string;
    entityName: string;
    amount: number;
    currency: string;
    description: string;
    context: LoggingContext;
    balanceChange?: { before: number; after: number; entityType: 'customer' | 'supplier' | 'cash_drawer' };
    severity?: ComprehensiveLogEntry['severity'];
  }): string {
    const entry: ComprehensiveLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      category: 'financial',
      subcategory: params.action,
      severity: params.severity || 'medium',
      title: `Financial ${params.action.replace(/_/g, ' ')}`,
      description: params.description,
      entity: {
        type: params.entityType,
        id: params.entityId,
        name: params.entityName
      },
      user: {
        id: params.context.userId,
        email: params.context.userEmail,
        name: params.context.userName
      },
      financial: {
        amount: params.amount,
        currency: params.currency,
        balanceChange: params.balanceChange
      },
      metadata: {
        correlationId: params.context.correlationId,
        sessionId: params.context.sessionId,
        source: params.context.source || 'web',
        module: params.context.module,
        tags: ['financial', params.action, params.currency.toLowerCase()]
      }
    };

    this.logs.push(entry);
    this.saveLogsToStorage();
    this.notifySubscribers(entry);
    return entry.id;
  }

  public logSystemActivity(params: {
    action: string;
    description: string;
    context: LoggingContext;
    severity?: ComprehensiveLogEntry['severity'];
    metadata?: Record<string, any>;
  }): string {
    const entry: ComprehensiveLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      category: 'system',
      subcategory: params.action,
      severity: params.severity || 'low',
      title: `System ${params.action.replace(/_/g, ' ')}`,
      description: params.description,
      entity: {
        type: 'system',
        id: 'system',
        name: 'System'
      },
      user: {
        id: params.context.userId,
        email: params.context.userEmail,
        name: params.context.userName
      },
      metadata: {
        correlationId: params.context.correlationId,
        sessionId: params.context.sessionId,
        source: params.context.source || 'system',
        module: params.context.module,
        tags: ['system', params.action],
        ...params.metadata
      }
    };

    this.logs.push(entry);
    this.saveLogsToStorage();
    this.notifySubscribers(entry);
    return entry.id;
  }

  // Query and analysis methods
  public getLogs(params: {
    startDate?: string;
    endDate?: string;
    category?: ComprehensiveLogEntry['category'];
    severity?: ComprehensiveLogEntry['severity'];
    userId?: string;
    entityType?: string;
    entityId?: string;
    searchTerm?: string;
    limit?: number;
    offset?: number;
  } = {}): ComprehensiveLogEntry[] {
    let filtered = [...this.logs];

    if (params.startDate) {
      filtered = filtered.filter(log => log.timestamp >= params.startDate!);
    }
    if (params.endDate) {
      filtered = filtered.filter(log => log.timestamp <= params.endDate!);
    }
    if (params.category) {
      filtered = filtered.filter(log => log.category === params.category);
    }
    if (params.severity) {
      filtered = filtered.filter(log => log.severity === params.severity);
    }
    if (params.userId) {
      filtered = filtered.filter(log => log.user.id === params.userId);
    }
    if (params.entityType) {
      filtered = filtered.filter(log => log.entity.type === params.entityType);
    }
    if (params.entityId) {
      filtered = filtered.filter(log => log.entity.id === params.entityId);
    }
    if (params.searchTerm) {
      const search = params.searchTerm.toLowerCase();
      filtered = filtered.filter(log => 
        log.title.toLowerCase().includes(search) ||
        log.description.toLowerCase().includes(search) ||
        log.entity.name?.toLowerCase().includes(search) ||
        log.user.name?.toLowerCase().includes(search) ||
        log.user.email?.toLowerCase().includes(search)
      );
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    if (params.offset) {
      filtered = filtered.slice(params.offset);
    }
    if (params.limit) {
      filtered = filtered.slice(0, params.limit);
    }

    return filtered;
  }

  public generateActivitySummary(startDate?: string, endDate?: string): ActivitySummary {
    const logs = this.getLogs({ startDate, endDate });
    
    const summary: ActivitySummary = {
      period: {
        start: startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        end: endDate || new Date().toISOString()
      },
      totals: {
        activities: logs.length,
        users: new Set(logs.map(log => log.user.id)).size,
        entities: new Set(logs.map(log => `${log.entity.type}:${log.entity.id}`)).size,
        errors: logs.filter(log => log.severity === 'critical' || log.severity === 'high').length
      },
      breakdown: {
        byCategory: logs.reduce((acc, log) => {
          acc[log.category] = (acc[log.category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        bySeverity: logs.reduce((acc, log) => {
          acc[log.severity] = (acc[log.severity] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        byUser: logs.reduce((acc, log) => {
          const userKey = log.user.name || log.user.email || log.user.id;
          acc[userKey] = (acc[userKey] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        byHour: logs.reduce((acc, log) => {
          const hour = new Date(log.timestamp).getHours().toString();
          acc[hour] = (acc[hour] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      },
      trends: {
        activityGrowth: this.calculateGrowthRate(logs),
        errorRate: logs.length > 0 ? (logs.filter(log => log.severity === 'critical' || log.severity === 'high').length / logs.length) * 100 : 0,
        peakHours: this.getPeakHours(logs)
      },
      financialImpact: {
        totalTransactionValue: logs
          .filter(log => log.financial?.amount)
          .reduce((sum, log) => sum + (log.financial!.amount || 0), 0),
        balanceChanges: logs.filter(log => log.financial?.balanceChange).length,
        accountsAffected: new Set(
          logs
            .filter(log => log.financial?.balanceChange)
            .map(log => `${log.financial!.balanceChange!.entityType}:${log.entity.id}`)
        ).size
      },
      alerts: this.generateAlerts(logs)
    };

    return summary;
  }

  private calculateGrowthRate(logs: ComprehensiveLogEntry[]): number {
    // Simple growth rate calculation - compare first and second half of the period
    const midPoint = Math.floor(logs.length / 2);
    const firstHalf = logs.slice(0, midPoint).length;
    const secondHalf = logs.slice(midPoint).length;
    
    if (firstHalf === 0) return 0;
    return ((secondHalf - firstHalf) / firstHalf) * 100;
  }

  private getPeakHours(logs: ComprehensiveLogEntry[]): string[] {
    const hourCounts = logs.reduce((acc, log) => {
      const hour = new Date(log.timestamp).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const maxCount = Math.max(...Object.values(hourCounts));
    return Object.entries(hourCounts)
      .filter(([, count]) => count === maxCount)
      .map(([hour]) => `${hour}:00`);
  }

  private generateAlerts(logs: ComprehensiveLogEntry[]): ActivitySummary['alerts'] {
    const alerts: ActivitySummary['alerts'] = [];

    // Security alerts
    const criticalEvents = logs.filter(log => log.severity === 'critical');
    if (criticalEvents.length > 0) {
      alerts.push({
        type: 'security',
        severity: 'critical',
        message: `${criticalEvents.length} critical security events detected`,
        count: criticalEvents.length
      });
    }

    // High error rate alert
    const errorRate = (logs.filter(log => log.severity === 'high' || log.severity === 'critical').length / logs.length) * 100;
    if (errorRate > 10) {
      alerts.push({
        type: 'integrity',
        severity: errorRate > 25 ? 'critical' : 'high',
        message: `High error rate detected: ${errorRate.toFixed(1)}%`,
        count: Math.floor(errorRate)
      });
    }

    // Unusual activity patterns
    const financialLogs = logs.filter(log => log.category === 'financial');
    if (financialLogs.length > logs.length * 0.5) {
      alerts.push({
        type: 'business',
        severity: 'medium',
        message: 'High volume of financial transactions detected',
        count: financialLogs.length
      });
    }

    return alerts;
  }

  // Utility methods
  public subscribe(callback: (entry: ComprehensiveLogEntry) => void): () => void {
    this.subscribers.push(callback);
    
    return () => {
      const index = this.subscribers.indexOf(callback);
      if (index > -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  public exportLogs(params: Parameters<typeof this.getLogs>[0] = {}): string {
    const logs = this.getLogs(params);
    return JSON.stringify(logs, null, 2);
  }

  public clearLogs(olderThanDays?: number): number {
    const initialCount = this.logs.length;
    
    if (olderThanDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      const cutoffTimestamp = cutoffDate.toISOString();
      
      this.logs = this.logs.filter(log => log.timestamp >= cutoffTimestamp);
    } else {
      this.logs = [];
    }
    
    this.saveLogsToStorage();
    return initialCount - this.logs.length;
  }

  private generateId(): string {
    return `comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const comprehensiveLoggingService = ComprehensiveLoggingService.getInstance(); 