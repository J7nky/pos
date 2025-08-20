import { db, Bill, BillLineItem, BillAuditLog } from '../lib/db';

/**
 * Utility functions for bill management offline synchronization
 */

export interface BillSyncResult {
  success: boolean;
  billsProcessed: number;
  lineItemsProcessed: number;
  auditLogsProcessed: number;
  errors: string[];
}

export interface BillValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  billsChecked: number;
  issuesFound: number;
}

/**
 * Validate bill data integrity for offline storage
 */
export async function validateBillData(storeId: string): Promise<BillValidationResult> {
  const result: BillValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    billsChecked: 0,
    issuesFound: 0
  };

  try {
    // Get all bills for the store
    const bills = await db.bills.where('store_id').equals(storeId).toArray();
    result.billsChecked = bills.length;

    for (const bill of bills) {
      // Validate required fields
      if (!bill.bill_number) {
        result.errors.push(`Bill ${bill.id} missing bill_number`);
        result.issuesFound++;
      }

      if (!bill.payment_method || !['cash', 'card', 'credit'].includes(bill.payment_method)) {
        result.errors.push(`Bill ${bill.id} has invalid payment_method: ${bill.payment_method}`);
        result.issuesFound++;
      }

      if (!bill.payment_status || !['paid', 'partial', 'pending'].includes(bill.payment_status)) {
        result.errors.push(`Bill ${bill.id} has invalid payment_status: ${bill.payment_status}`);
        result.issuesFound++;
      }

      if (bill.total_amount < 0) {
        result.errors.push(`Bill ${bill.id} has negative total_amount: ${bill.total_amount}`);
        result.issuesFound++;
      }

      if (bill.amount_paid < 0) {
        result.errors.push(`Bill ${bill.id} has negative amount_paid: ${bill.amount_paid}`);
        result.issuesFound++;
      }

      if (bill.amount_due < 0) {
        result.errors.push(`Bill ${bill.id} has negative amount_due: ${bill.amount_due}`);
        result.issuesFound++;
      }

      // Validate line items exist
      const lineItems = await db.bill_line_items.where('bill_id').equals(bill.id).toArray();
      if (lineItems.length === 0) {
        result.warnings.push(`Bill ${bill.id} has no line items`);
      }

      // Validate line items totals match bill total
      const calculatedTotal = lineItems.reduce((sum, item) => sum + (item.line_total || 0), 0);
      const totalDifference = Math.abs(calculatedTotal - (bill.subtotal || 0));
      if (totalDifference > 0.01) { // Allow for small rounding differences
        result.warnings.push(`Bill ${bill.id} total mismatch: calculated ${calculatedTotal}, stored ${bill.subtotal}`);
      }

      // Check for orphaned references
      if (bill.customer_id) {
        const customer = await db.customers.get(bill.customer_id);
        if (!customer) {
          result.errors.push(`Bill ${bill.id} references non-existent customer: ${bill.customer_id}`);
          result.issuesFound++;
        }
      }

      if (bill.created_by) {
        // Note: We don't have users table in offline DB, so we can't validate this
        // This would be validated during sync to Supabase
      }
    }

    result.isValid = result.errors.length === 0;

  } catch (error) {
    result.errors.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    result.isValid = false;
  }

  return result;
}

/**
 * Clean up invalid bill data
 */
export async function cleanupBillData(storeId: string): Promise<BillSyncResult> {
  const result: BillSyncResult = {
    success: true,
    billsProcessed: 0,
    lineItemsProcessed: 0,
    auditLogsProcessed: 0,
    errors: []
  };

  try {
    // Get all bills for the store
    const bills = await db.bills.where('store_id').equals(storeId).toArray();
    result.billsProcessed = bills.length;

    for (const bill of bills) {
      let needsUpdate = false;
      const updates: Partial<Bill> = {};

      // Fix missing required fields
      if (!bill.payment_method) {
        updates.payment_method = 'cash';
        needsUpdate = true;
      }

      if (!bill.payment_status) {
        updates.payment_status = 'pending';
        needsUpdate = true;
      }

      if (bill.amount_paid === undefined || bill.amount_paid === null) {
        updates.amount_paid = 0;
        needsUpdate = true;
      }

      if (bill.amount_due === undefined || bill.amount_due === null) {
        updates.amount_due = bill.total_amount || 0;
        needsUpdate = true;
      }

      if (!bill.status) {
        updates.status = 'active';
        needsUpdate = true;
      }

      if (needsUpdate) {
        await db.bills.update(bill.id, { ...updates, _synced: false });
      }

      // Clean up line items
      const lineItems = await db.bill_line_items.where('bill_id').equals(bill.id).toArray();
      result.lineItemsProcessed += lineItems.length;

      for (const lineItem of lineItems) {
        let lineNeedsUpdate = false;
        const lineUpdates: Partial<BillLineItem> = {};

        if (!lineItem.product_name) {
          lineUpdates.product_name = 'Unknown Product';
          lineNeedsUpdate = true;
        }

        if (!lineItem.supplier_name) {
          lineUpdates.supplier_name = 'Unknown Supplier';
          lineNeedsUpdate = true;
        }

        if (lineItem.quantity <= 0) {
          lineUpdates.quantity = 1;
          lineNeedsUpdate = true;
        }

        if (lineItem.unit_price < 0) {
          lineUpdates.unit_price = 0;
          lineNeedsUpdate = true;
        }

        if (lineItem.line_total < 0) {
          lineUpdates.line_total = 0;
          lineNeedsUpdate = true;
        }

        if (!lineItem.line_order) {
          lineUpdates.line_order = 1;
          lineNeedsUpdate = true;
        }

        if (lineNeedsUpdate) {
          await db.bill_line_items.update(lineItem.id, { ...lineUpdates, _synced: false });
        }
      }

      // Clean up audit logs
      const auditLogs = await db.bill_audit_logs.where('bill_id').equals(bill.id).toArray();
      result.auditLogsProcessed += auditLogs.length;

      for (const auditLog of auditLogs) {
        let auditNeedsUpdate = false;
        const auditUpdates: Partial<BillAuditLog> = {};

        if (!auditLog.action) {
          auditUpdates.action = 'updated';
          auditNeedsUpdate = true;
        }

        if (!auditLog.changed_by) {
          auditUpdates.changed_by = 'system';
          auditNeedsUpdate = true;
        }

        if (auditNeedsUpdate) {
          await db.bill_audit_logs.update(auditLog.id, { ...auditUpdates, _synced: false });
        }
      }
    }

  } catch (error) {
    result.success = false;
    result.errors.push(`Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return result;
}

/**
 * Prepare bill data for sync to Supabase
 */
export function prepareBillForSync(bill: any): any {
  const { _synced, _lastSyncedAt, _deleted, ...cleanBill } = bill;

  // Ensure required fields are present
  if (!cleanBill.payment_method) {
    cleanBill.payment_method = 'cash';
  }

  if (!cleanBill.payment_status) {
    cleanBill.payment_status = 'pending';
  }

  if (cleanBill.amount_paid === undefined || cleanBill.amount_paid === null) {
    cleanBill.amount_paid = 0;
  }

  if (cleanBill.amount_due === undefined || cleanBill.amount_due === null) {
    cleanBill.amount_due = cleanBill.total_amount || 0;
  }

  if (!cleanBill.status) {
    cleanBill.status = 'active';
  }

  if (!cleanBill.bill_number) {
    cleanBill.bill_number = `BILL-${Date.now()}`;
  }

  // Ensure numeric fields are properly formatted
  cleanBill.subtotal = Number(cleanBill.subtotal || 0);
  cleanBill.total_amount = Number(cleanBill.total_amount || 0);
  cleanBill.amount_paid = Number(cleanBill.amount_paid || 0);
  cleanBill.amount_due = Number(cleanBill.amount_due || 0);

  return cleanBill;
}

/**
 * Prepare bill line item for sync to Supabase
 */
export function prepareBillLineItemForSync(lineItem: any): any {
  const { _synced, _lastSyncedAt, _deleted, ...cleanLineItem } = lineItem;

  // Ensure required fields
  if (!cleanLineItem.product_name) {
    cleanLineItem.product_name = 'Unknown Product';
  }

  if (!cleanLineItem.supplier_name) {
    cleanLineItem.supplier_name = 'Unknown Supplier';
  }

  if (cleanLineItem.quantity <= 0) {
    cleanLineItem.quantity = 1;
  }

  if (cleanLineItem.unit_price < 0) {
    cleanLineItem.unit_price = 0;
  }

  if (cleanLineItem.line_total < 0) {
    cleanLineItem.line_total = 0;
  }

  if (!cleanLineItem.line_order) {
    cleanLineItem.line_order = 1;
  }

  // Ensure numeric fields are properly formatted
  cleanLineItem.quantity = Number(cleanLineItem.quantity);
  cleanLineItem.unit_price = Number(cleanLineItem.unit_price);
  cleanLineItem.line_total = Number(cleanLineItem.line_total);
  cleanLineItem.weight = cleanLineItem.weight ? Number(cleanLineItem.weight) : null;
  cleanLineItem.line_order = Number(cleanLineItem.line_order);

  return cleanLineItem;
}

/**
 * Prepare bill audit log for sync to Supabase
 */
export function prepareBillAuditLogForSync(auditLog: any): any {
  const { _synced, _lastSyncedAt, _deleted, ...cleanAuditLog } = auditLog;

  // Ensure required fields
  if (!cleanAuditLog.action) {
    cleanAuditLog.action = 'updated';
  }

  if (!cleanAuditLog.changed_by) {
    cleanAuditLog.changed_by = 'system';
  }

  return cleanAuditLog;
}

/**
 * Get bill statistics for reporting
 */
export async function getBillStatistics(storeId: string, dateRange?: { start: string; end: string }): Promise<{
  totalBills: number;
  totalAmount: number;
  paidBills: number;
  pendingBills: number;
  cancelledBills: number;
  averageBillAmount: number;
  paymentMethodBreakdown: Record<string, number>;
  dailyTrend: Array<{ date: string; count: number; amount: number }>;
}> {
  try {
    let bills = await db.bills.where('store_id').equals(storeId).toArray();

    // Apply date filter if provided
    if (dateRange) {
      bills = bills.filter(bill => 
        bill.bill_date >= dateRange.start && bill.bill_date <= dateRange.end
      );
    }

    const activeBills = bills.filter(bill => bill.status === 'active');
    const totalAmount = activeBills.reduce((sum, bill) => sum + (bill.total_amount || 0), 0);
    const paidBills = activeBills.filter(bill => bill.payment_status === 'paid').length;
    const pendingBills = activeBills.filter(bill => bill.payment_status === 'pending').length;
    const cancelledBills = bills.filter(bill => bill.status === 'cancelled').length;

    const paymentMethodBreakdown = activeBills.reduce((acc, bill) => {
      acc[bill.payment_method] = (acc[bill.payment_method] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate daily trend
    const dailyTrend = activeBills.reduce((acc, bill) => {
      const date = bill.bill_date.split('T')[0];
      const existing = acc.find(item => item.date === date);
      if (existing) {
        existing.count++;
        existing.amount += bill.total_amount || 0;
      } else {
        acc.push({
          date,
          count: 1,
          amount: bill.total_amount || 0
        });
      }
      return acc;
    }, [] as Array<{ date: string; count: number; amount: number }>);

    return {
      totalBills: activeBills.length,
      totalAmount,
      paidBills,
      pendingBills,
      cancelledBills,
      averageBillAmount: activeBills.length > 0 ? totalAmount / activeBills.length : 0,
      paymentMethodBreakdown,
      dailyTrend: dailyTrend.sort((a, b) => a.date.localeCompare(b.date))
    };

  } catch (error) {
    console.error('Error calculating bill statistics:', error);
    throw error;
  }
}

/**
 * Export bills to CSV format
 */
export async function exportBillsToCSV(storeId: string, filters?: any): Promise<string> {
  try {
    let bills = await db.bills.where('store_id').equals(storeId).toArray();

    // Apply filters
    if (filters) {
      if (filters.dateFrom) {
        bills = bills.filter(bill => bill.bill_date >= filters.dateFrom);
      }
      if (filters.dateTo) {
        bills = bills.filter(bill => bill.bill_date <= filters.dateTo);
      }
      if (filters.paymentStatus) {
        bills = bills.filter(bill => bill.payment_status === filters.paymentStatus);
      }
      if (filters.status) {
        bills = bills.filter(bill => bill.status === filters.status);
      }
    }

    // Create CSV content
    const headers = [
      'Bill Number',
      'Date',
      'Customer Name',
      'Subtotal',
      'Total Amount',
      'Payment Method',
      'Payment Status',
      'Amount Paid',
      'Amount Due',
      'Status',
      'Notes',
      'Created By',
      'Created At'
    ];

    const rows = await Promise.all(bills.map(async (bill) => {
      // Get user information if available
      const user = await db.users?.get(bill.created_by);
      
      return [
        bill.bill_number,
        new Date(bill.bill_date).toLocaleDateString(),
        bill.customer_name || 'Walk-in Customer',
        bill.subtotal?.toFixed(2) || '0.00',
        bill.total_amount?.toFixed(2) || '0.00',
        bill.payment_method,
        bill.payment_status,
        bill.amount_paid?.toFixed(2) || '0.00',
        bill.amount_due?.toFixed(2) || '0.00',
        bill.status,
        bill.notes || '',
        user?.name || bill.created_by,
        new Date(bill.created_at).toLocaleString()
      ];
    }));

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;

  } catch (error) {
    console.error('Error exporting bills to CSV:', error);
    throw error;
  }
}

/**
 * Sync bills with Supabase when connection is restored
 */
export async function syncBillsWithSupabase(storeId: string): Promise<BillSyncResult> {
  const result: BillSyncResult = {
    success: true,
    billsProcessed: 0,
    lineItemsProcessed: 0,
    auditLogsProcessed: 0,
    errors: []
  };

  try {
    // Get unsynced bills
    const unsyncedBills = await db.bills
      .where('store_id').equals(storeId)
      .filter(bill => !bill._synced)
      .toArray();

    // Get unsynced line items
    const unsyncedLineItems = await db.bill_line_items
      .where('store_id').equals(storeId)
      .filter(item => !item._synced)
      .toArray();

    // Get unsynced audit logs
    const unsyncedAuditLogs = await db.bill_audit_logs
      .where('store_id').equals(storeId)
      .filter(log => !log._synced)
      .toArray();

    // Sync bills
    for (const bill of unsyncedBills) {
      try {
        const cleanBill = prepareBillForSync(bill);
        // Note: Actual Supabase sync would happen in syncService
        // This is just preparation and validation
        result.billsProcessed++;
      } catch (error) {
        result.errors.push(`Failed to prepare bill ${bill.id}: ${error}`);
      }
    }

    // Sync line items
    for (const lineItem of unsyncedLineItems) {
      try {
        const cleanLineItem = prepareBillLineItemForSync(lineItem);
        result.lineItemsProcessed++;
      } catch (error) {
        result.errors.push(`Failed to prepare line item ${lineItem.id}: ${error}`);
      }
    }

    // Sync audit logs
    for (const auditLog of unsyncedAuditLogs) {
      try {
        const cleanAuditLog = prepareBillAuditLogForSync(auditLog);
        result.auditLogsProcessed++;
      } catch (error) {
        result.errors.push(`Failed to prepare audit log ${auditLog.id}: ${error}`);
      }
    }

    result.success = result.errors.length === 0;

  } catch (error) {
    result.success = false;
    result.errors.push(`Sync preparation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return result;
}