import { 
  Customer, 
  Supplier, 
  Transaction, 

  SaleItem,
  InventoryItem
} from '../types';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  entityName?: string;
  description: string;
  previousData?: any;
  newData?: any;
  changedFields?: string[];
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    correlationId?: string;
    source: 'web' | 'mobile' | 'api' | 'system';
    module: string;
  };
  balanceChange?: {
    entityType: 'customer' | 'supplier' | 'cash_drawer';
    balanceBefore: number;
    balanceAfter: number;
    currency: string;
  };
  relatedTransactions?: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
}

export type AuditAction = 
  // Customer actions
  | 'customer_created' | 'customer_updated' | 'customer_deleted' | 'customer_payment_received'
  | 'customer_credit_sale' | 'customer_balance_adjusted'
  // Supplier actions
  | 'supplier_created' | 'supplier_updated' | 'supplier_deleted' | 'supplier_payment_sent'
  | 'supplier_commission_calculated' | 'supplier_balance_adjusted'
  // Transaction actions
  | 'transaction_created' | 'transaction_updated' | 'transaction_deleted' | 'transaction_voided'
  // Inventory actions
  | 'inventory_received' | 'inventory_sold' | 'inventory_adjusted' | 'inventory_transferred'
  // Sales actions
  | 'sale_created' | 'sale_updated' | 'sale_cancelled' | 'sale_refunded'
  // Account actions
  | 'receivable_created' | 'receivable_updated' | 'receivable_paid'
  | 'payable_created' | 'payable_updated' | 'payable_paid'
  // System actions
  | 'data_sync' | 'backup_created' | 'system_maintenance' | 'user_login' | 'user_logout'
  // Cash drawer actions
  | 'cash_drawer_opened' | 'cash_drawer_closed' | 'cash_adjustment';

export type EntityType = 
  | 'customer' | 'supplier' | 'transaction' | 'sale' | 'inventory_item'
   | 'cash_drawer' | 'user' | 'system';

export interface AuditQuery {
  startDate?: string;
  endDate?: string;
  userId?: string;
  entityType?: EntityType;
  entityId?: string;
  action?: AuditAction;
  severity?: AuditLogEntry['severity'];
  tags?: string[];
  searchTerm?: string;
  correlationId?: string;
  limit?: number;
  offset?: number;
}

export interface AuditSummary {
  totalEntries: number;
  entriesByAction: Record<AuditAction, number>;
  entriesByUser: Record<string, number>;
  entriesByEntityType: Record<EntityType, number>;
  entriesBySeverity: Record<string, number>;
  recentActivity: AuditLogEntry[];
  criticalEvents: AuditLogEntry[];
}

export interface BalanceChangeLog {
  entityId: string;
  entityType: 'customer' | 'supplier';
  entityName: string;
  timestamp: string;
  balanceBefore: number;
  balanceAfter: number;
  changeAmount: number;
  currency: string;
  reason: string;
  relatedTransactionId?: string;
  userId: string;
}

export class AuditLogService {
  private static instance: AuditLogService;
  private logs: AuditLogEntry[] = [];
  private balanceChanges: BalanceChangeLog[] = [];
  private correlationMap: Map<string, string[]> = new Map();

  private constructor() {
    this.loadLogsFromStorage();
  }

  public static getInstance(): AuditLogService {
    if (!AuditLogService.instance) {
      AuditLogService.instance = new AuditLogService();
    }
    return AuditLogService.instance;
  }

  private loadLogsFromStorage(): void {
    try {
      const storedLogs = localStorage.getItem('erp_audit_logs');
      this.logs = storedLogs ? JSON.parse(storedLogs) : [];
      
      const storedBalanceChanges = localStorage.getItem('erp_balance_changes');
      this.balanceChanges = storedBalanceChanges ? JSON.parse(storedBalanceChanges) : [];
      
      // Rebuild correlation map
      this.logs.forEach(log => {
        if (log.metadata.correlationId && log.relatedTransactions) {
          this.correlationMap.set(log.metadata.correlationId, log.relatedTransactions);
        }
      });
    } catch (error) {
      console.error('Error loading audit logs:', error);
      this.logs = [];
      this.balanceChanges = [];
    }
  }

  private saveLogsToStorage(): void {
    try {
      localStorage.setItem('erp_audit_logs', JSON.stringify(this.logs));
      localStorage.setItem('erp_balance_changes', JSON.stringify(this.balanceChanges));
    } catch (error) {
      console.error('Error saving audit logs:', error);
    }
  }

  private generateId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCorrelationId(): string {
    return `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Main logging method
  public log(params: {
    action: AuditAction;
    entityType: EntityType;
    entityId: string;
    entityName?: string;
    description: string;
    userId: string;
    userEmail?: string;
    userName?: string;
    previousData?: any;
    newData?: any;
    changedFields?: string[];
    balanceChange?: AuditLogEntry['balanceChange'];
    relatedTransactions?: string[];
    severity?: AuditLogEntry['severity'];
    tags?: string[];
    correlationId?: string;
    metadata?: Partial<AuditLogEntry['metadata']>;
  }): string {
    const logEntry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      userId: params.userId,
      userEmail: params.userEmail,
      userName: params.userName,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      entityName: params.entityName,
      description: params.description,
      previousData: params.previousData,
      newData: params.newData,
      changedFields: params.changedFields || [],
      metadata: {
        source: 'web',
        module: 'accounting',
        correlationId: params.correlationId || this.generateCorrelationId(),
        sessionId: this.getCurrentSessionId(),
        ...params.metadata
      },
      balanceChange: params.balanceChange,
      relatedTransactions: params.relatedTransactions || [],
      severity: params.severity || this.determineSeverity(params.action),
      tags: params.tags || this.generateTags(params.action, params.entityType)
    };

    this.logs.push(logEntry);

    // Log balance change separately if provided
    if (params.balanceChange) {
      this.logBalanceChange({
        entityId: params.entityId,
        entityType: params.entityType === 'customer' || params.entityType === 'supplier'
          ? params.entityType
          : 'customer', // fallback or handle as needed
        entityName: params.entityName || params.entityId,
        timestamp: logEntry.timestamp,
        balanceBefore: params.balanceChange.balanceBefore,
        balanceAfter: params.balanceChange.balanceAfter,
        changeAmount: params.balanceChange.balanceAfter - params.balanceChange.balanceBefore,
        currency: params.balanceChange.currency,
        reason: params.description,
        relatedTransactionId: params.relatedTransactions?.[0],
        userId: params.userId
      });
    }

    // Update correlation map
    if (
      logEntry.metadata.correlationId &&
      Array.isArray(logEntry.relatedTransactions) &&
      logEntry.relatedTransactions.length > 0
    ) {
      const existing = this.correlationMap.get(logEntry.metadata.correlationId) || [];
      this.correlationMap.set(
        logEntry.metadata.correlationId,
        [...existing, ...logEntry.relatedTransactions]
      );
    }

    this.saveLogsToStorage();
    
    // Emit event for real-time updates
    this.emitLogEvent(logEntry);

    return logEntry.id;
  }

  // Specialized logging methods
  public logCustomerPayment(params: {
    customerId: string;
    customerName: string;
    amount: number;
    currency: string;
    balanceBefore: number;
    balanceAfter: number;
    transactionId: string;
    userId: string;
    userEmail?: string;
    paymentMethod?: string;
  }): string {
    return this.log({
      action: 'customer_payment_received',
      entityType: 'customer',
      entityId: params.customerId,
      entityName: params.customerName,
      description: `Payment received: ${params.currency} ${params.amount}${params.paymentMethod ? ` via ${params.paymentMethod}` : ''}`,
      userId: params.userId,
      userEmail: params.userEmail,
      balanceChange: {
        entityType: 'customer',
        balanceBefore: params.balanceBefore,
        balanceAfter: params.balanceAfter,
        currency: params.currency
      },
      relatedTransactions: [params.transactionId],
      severity: 'medium',
      tags: ['payment', 'customer', 'revenue', params.currency.toLowerCase()]
    });
  }

  public logSupplierPayment(params: {
    supplierId: string;
    supplierName: string;
    amount: number;
    currency: string;
    balanceBefore: number;
    balanceAfter: number;
    transactionId: string;
    userId: string;
    userEmail?: string;
    paymentMethod?: string;
  }): string {
    return this.log({
      action: 'supplier_payment_sent',
      entityType: 'supplier',
      entityId: params.supplierId,
      entityName: params.supplierName,
      description: `Payment sent: ${params.currency} ${params.amount}${params.paymentMethod ? ` via ${params.paymentMethod}` : ''}`,
      userId: params.userId,
      userEmail: params.userEmail,
      balanceChange: {
        entityType: 'supplier',
        balanceBefore: params.balanceBefore,
        balanceAfter: params.balanceAfter,
        currency: params.currency
      },
      relatedTransactions: [params.transactionId],
      severity: 'medium',
      tags: ['payment', 'supplier', 'expense', params.currency.toLowerCase()]
    });
  }

  public logSaleTransaction(params: {
    sale: any; // Add sale parameter
    items: SaleItem[];
    customerId?: string;
    customerName?: string;
    userId: string;
    userEmail?: string;
    balanceChange?: AuditLogEntry['balanceChange'];
  }): string {
    const itemsDescription = params.items.map(item => 
      `${item.productId} (${item.unitPrice}${item.weight ? ` x ${item.weight}kg` : ''})`
    ).join(', ');

    return this.log({
      action: 'sale_created',
      entityType: 'sale',
      entityId: params.sale.id,
      entityName: `Sale to ${params.customerName || 'Walk-in Customer'}`,
      description: `Sale completed: ${itemsDescription}. Total: $${params.sale.total}`,
      userId: params.userId,
      userEmail: params.userEmail,
      newData: {
        sale: params.sale,
        items: params.items
      },
      balanceChange: params.balanceChange,
      severity: 'low',
      tags: ['sale', 'revenue', params.sale.paymentMethod, params.customerId ? 'credit' : 'cash']
    });
  }

  public logInventoryReceived(params: {
    inventoryItem: InventoryItem;
    productName: string;
    supplierName: string;
    userId: string;
    userEmail?: string;
  }): string {
    return this.log({
      action: 'inventory_received',
      entityType: 'inventory_item',
      entityId: params.inventoryItem.id,
      entityName: params.productName,
      description: `Inventory received: ${params.inventoryItem.quantity} ${params.inventoryItem.unit} of ${params.productName} from ${params.supplierName}`,
      userId: params.userId,
      userEmail: params.userEmail,
      newData: params.inventoryItem,
      severity: 'low',
      tags: ['inventory', 'receiving', params.inventoryItem.type]
    });
  }

  private logBalanceChange(change: BalanceChangeLog): void {
    this.balanceChanges.push(change);
  }

  private determineSeverity(action: AuditAction): AuditLogEntry['severity'] {
    const criticalActions: AuditAction[] = [
      'customer_deleted', 'supplier_deleted', 'transaction_deleted', 'transaction_voided',
      'sale_cancelled', 'sale_refunded', 'cash_adjustment'
    ];
    
    const highActions: AuditAction[] = [
      'customer_balance_adjusted', 'supplier_balance_adjusted', 'cash_drawer_opened', 'cash_drawer_closed'
    ];
    
    const mediumActions: AuditAction[] = [
      'customer_payment_received', 'supplier_payment_sent'
    ];

    if (criticalActions.includes(action)) return 'critical';
    if (highActions.includes(action)) return 'high';
    if (mediumActions.includes(action)) return 'medium';
    return 'low';
  }

  private generateTags(action: AuditAction, entityType: EntityType): string[] {
    const tags: string[] = [entityType];
    
    if (action.includes('payment')) tags.push('payment');
    if (action.includes('created')) tags.push('create');
    if (action.includes('updated')) tags.push('update');
    if (action.includes('deleted')) tags.push('delete');
    if (action.includes('sale')) tags.push('sale');
    if (action.includes('inventory')) tags.push('inventory');
    
    return tags;
  }

  private getCurrentSessionId(): string {
    let sessionId = sessionStorage.getItem('audit_session_id');
    if (!sessionId) {
      sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('audit_session_id', sessionId);
    }
    return sessionId;
  }

  private emitLogEvent(logEntry: AuditLogEntry): void {
    // Emit custom event for real-time updates
    window.dispatchEvent(new CustomEvent('audit-log-created', { 
      detail: logEntry 
    }));
  }

  // Query methods
  public queryLogs(query: AuditQuery): AuditLogEntry[] {
    let filtered = [...this.logs];

    if (query.startDate) {
      filtered = filtered.filter(log => log.timestamp >= query.startDate!);
    }
    
    if (query.endDate) {
      filtered = filtered.filter(log => log.timestamp <= query.endDate!);
    }
    
    if (query.userId) {
      filtered = filtered.filter(log => log.userId === query.userId);
    }
    
    if (query.entityType) {
      filtered = filtered.filter(log => log.entityType === query.entityType);
    }
    
    if (query.entityId) {
      filtered = filtered.filter(log => log.entityId === query.entityId);
    }
    
    if (query.action) {
      filtered = filtered.filter(log => log.action === query.action);
    }
    
    if (query.severity) {
      filtered = filtered.filter(log => log.severity === query.severity);
    }
    
    if (query.tags && query.tags.length > 0) {
      filtered = filtered.filter(log => 
        query.tags!.some(tag => log.tags.includes(tag))
      );
    }
    
    if (query.searchTerm) {
      const searchLower = query.searchTerm.toLowerCase();
      filtered = filtered.filter(log => 
        log.description.toLowerCase().includes(searchLower) ||
        log.entityName?.toLowerCase().includes(searchLower) ||
        log.userName?.toLowerCase().includes(searchLower) ||
        log.userEmail?.toLowerCase().includes(searchLower)
      );
    }
    
    if (query.correlationId) {
      filtered = filtered.filter(log => 
        log.metadata.correlationId === query.correlationId
      );
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    if (query.offset) {
      filtered = filtered.slice(query.offset);
    }
    
    if (query.limit) {
      filtered = filtered.slice(0, query.limit);
    }

    return filtered;
  }

  public getBalanceHistory(entityId: string, entityType: 'customer' | 'supplier'): BalanceChangeLog[] {
    return this.balanceChanges
      .filter(change => change.entityId === entityId && change.entityType === entityType)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public getCorrelatedTransactions(correlationId: string): string[] {
    return this.correlationMap.get(correlationId) || [];
  }

  public generateSummary(startDate?: string, endDate?: string): AuditSummary {
    const filtered = this.queryLogs({ startDate, endDate });
    
    const entriesByAction = filtered.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {} as Record<AuditAction, number>);
    
    const entriesByUser = filtered.reduce((acc, log) => {
      const key = log.userName || log.userEmail || log.userId;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const entriesByEntityType = filtered.reduce((acc, log) => {
      acc[log.entityType] = (acc[log.entityType] || 0) + 1;
      return acc;
    }, {} as Record<EntityType, number>);
    
    const entriesBySeverity = filtered.reduce((acc, log) => {
      acc[log.severity] = (acc[log.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalEntries: filtered.length,
      entriesByAction,
      entriesByUser,
      entriesByEntityType,
      entriesBySeverity,
      recentActivity: filtered.slice(0, 20),
      criticalEvents: filtered.filter(log => log.severity === 'critical').slice(0, 10)
    };
  }

  // Utility methods
  public exportLogs(query?: AuditQuery): string {
    const logs = query ? this.queryLogs(query) : this.logs;
    return JSON.stringify(logs, null, 2);
  }

  public clearLogs(olderThanDays?: number): number {
    const initialCount = this.logs.length;
    
    if (olderThanDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      const cutoffTimestamp = cutoffDate.toISOString();
      
      this.logs = this.logs.filter(log => log.timestamp >= cutoffTimestamp);
      this.balanceChanges = this.balanceChanges.filter(change => change.timestamp >= cutoffTimestamp);
    } else {
      this.logs = [];
      this.balanceChanges = [];
      this.correlationMap.clear();
    }
    
    this.saveLogsToStorage();
    return initialCount - this.logs.length;
  }
}

export const auditLogService = AuditLogService.getInstance(); 