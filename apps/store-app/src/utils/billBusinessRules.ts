/**
 * Centralized business rules for bill management
 * Handles payment status calculation, customer type changes, and balance adjustments
 */

import { Bill, Customer } from '../types';

/**
 * Calculate payment status based on amount paid and total amount
 * This is the single source of truth for payment status
 */
export function calculatePaymentStatus(amountPaid: number, totalAmount: number): 'paid' | 'partial' | 'pending' {
  if (amountPaid >= totalAmount) {
    return 'paid';
  } else if (amountPaid > 0) {
    return 'partial';
  } else {
    return 'pending';
  }
}

/**
 * Validate if a payment status change is allowed
 * - Cannot manually change a fully paid bill back to partial/pending
 * - Status must be calculated from amounts
 */
export function validatePaymentStatusChange(
  currentStatus: 'paid' | 'partial' | 'pending',
  newStatus: 'paid' | 'partial' | 'pending',
  amountPaid: number,
  totalAmount: number
): { valid: boolean; error?: string } {
  const calculatedStatus = calculatePaymentStatus(amountPaid, totalAmount);
  
  if (newStatus !== calculatedStatus) {
    return {
      valid: false,
      error: `Payment status must be ${calculatedStatus} based on amounts. Cannot manually override.`
    };
  }
  
  return { valid: true };
}

/**
 * Handle customer type change from walk-in to regular customer
 * Returns the adjusted bill properties
 */
export function handleCustomerTypeChange(
  bill: Partial<Bill>,
  newCustomerId: string | null,
  oldCustomerId: string | null,
  totalAmount: number
): {
  payment_method: 'cash' | 'card' | 'credit';
  amount_paid: number;
  payment_status: 'paid' | 'partial' | 'pending';
  warnings: string[];
} {
  const warnings: string[] = [];
  
  // If changing from walk-in (null) to a regular customer
  if (oldCustomerId === null && newCustomerId !== null) {
    warnings.push('Customer type changed from walk-in to regular customer');
    warnings.push('Payment method set to Credit, received amount set to 0');
    
    return {
      payment_method: 'credit',
      amount_paid: 0,
      payment_status: 'pending',
      warnings
    };
  }
  
  // If changing from regular customer to walk-in
  if (oldCustomerId !== null && newCustomerId === null) {
    warnings.push('Customer type changed from regular customer to walk-in');
    
    // Keep existing payment method and amount if reasonable
    // But if it was credit, suggest changing to cash
    if (bill.payment_method === 'credit') {
      warnings.push('Consider changing payment method from Credit to Cash for walk-in customer');
    }
    
    return {
      payment_method: bill.payment_method || 'cash',
      amount_paid: bill.amount_paid || 0,
      payment_status: calculatePaymentStatus(bill.amount_paid || 0, totalAmount),
      warnings
    };
  }
  
  // No customer type change
  return {
    payment_method: bill.payment_method || 'cash',
    amount_paid: bill.amount_paid || 0,
    payment_status: calculatePaymentStatus(bill.amount_paid || 0, totalAmount),
    warnings
  };
}

/**
 * Validate payment rules for walk-in and credit customers
 * - Walk-in customers cannot use credit payment method
 * - Walk-in customers must pay in full (cannot have partial/unpaid bills)
 * - Credit customers cannot have fully paid bills at creation/type switch
 */
export function validateCreditCustomerPayment(
  paymentMethod: 'cash' | 'card' | 'credit',
  customerId: string | null,
  amountPaid: number,
  totalAmount: number,
  isCustomerTypeSwitch: boolean
): { valid: boolean; error?: string } {
  // Walk-in customers (null customerId) validations
  if (customerId === null) {
    // Cannot use credit
    if (paymentMethod === 'credit') {
      return {
        valid: false,
        error: 'Walk-in customers cannot use credit payment method. Please select Cash or Card.'
      };
    }
    
    // Must pay in full (cannot have partial or unpaid bills)
    if (amountPaid < totalAmount) {
      return {
        valid: false,
        error: 'Walk-in customers must pay in full. Cannot have partial or unpaid bills since we cannot track their balance.'
      };
    }
  }
  
  // Credit customers cannot have fully paid bills during type switch
  if (paymentMethod === 'credit' && isCustomerTypeSwitch && customerId !== null) {
    if (amountPaid >= totalAmount) {
      return {
        valid: false,
        error: 'Credit customer cannot have a fully paid bill during customer type switch. This breaks credit logic.'
      };
    }
  }
  
  return { valid: true };
}

/**
 * Calculate balance adjustments when received amount changes
 * Returns the delta to apply to customer balance and cash drawer
 */
export function calculateBalanceAdjustments(
  oldAmountPaid: number,
  newAmountPaid: number,
  paymentMethod: 'cash' | 'card' | 'credit'
): {
  customerBalanceDelta: number; // Positive = increase debt, Negative = decrease debt
  cashDrawerDelta: number; // Positive = add to drawer, Negative = remove from drawer
  shouldUpdateCustomer: boolean;
  shouldUpdateCashDrawer: boolean;
} {
  const amountDifference = newAmountPaid - oldAmountPaid;
  
  // If amount paid increases, customer owes less (balance decreases)
  // If amount paid decreases, customer owes more (balance increases)
  const customerBalanceDelta = -amountDifference;
  
  // Cash drawer only affected by cash/card payments
  const shouldUpdateCashDrawer = paymentMethod === 'cash' || paymentMethod === 'card';
  const cashDrawerDelta = shouldUpdateCashDrawer ? amountDifference : 0;
  
  // Customer balance only affected if there's a customer (not walk-in)
  const shouldUpdateCustomer = true; // Will be filtered by caller if walk-in
  
  return {
    customerBalanceDelta,
    cashDrawerDelta,
    shouldUpdateCustomer,
    shouldUpdateCashDrawer
  };
}

/**
 * Apply balance adjustments to customer
 * Returns updated customer balance
 */
export function applyCustomerBalanceAdjustment(
  currentBalance: number,
  delta: number,
  currency: 'USD' | 'LBP'
): number {
  return currentBalance + delta;
}

/**
 * Validate that customer balance doesn't exceed max limit
 */
export function validateCustomerBalanceLimit(
  newBalance: number,
  maxBalance: number | undefined,
  currency: 'USD' | 'LBP'
): { valid: boolean; error?: string } {
  if (maxBalance !== undefined && newBalance > maxBalance) {
    return {
      valid: false,
      error: `Customer balance (${newBalance} ${currency}) would exceed maximum limit (${maxBalance} ${currency})`
    };
  }
  
  return { valid: true };
}

/**
 * Get supplier name from relationships
 * Resolves supplier through inventory_item -> inventory_bills (batch) -> supplier
 */
export function resolveSupplierName(
  inventoryItemId: string | null,
  inventoryItems: any[],
  inventoryBills: any[],
  suppliers: any[]
): string {
  if (!inventoryItemId) {
    return 'No Supplier';
  }
  
  // Find the inventory item
  const inventoryItem = inventoryItems.find(item => item.id === inventoryItemId);
  if (!inventoryItem) {
    return 'Unknown Supplier';
  }
  
  // Get supplier_id from the batch (inventory_bills)
  let supplierId: string | null = null;
  
  if (inventoryItem.batch_id) {
    const batch = inventoryBills.find(bill => bill.id === inventoryItem.batch_id);
    supplierId = batch?.supplier_id || null;
  }
  
  // Fallback to direct supplier_id on inventory item (legacy support)
  if (!supplierId && inventoryItem.supplier_id) {
    supplierId = inventoryItem.supplier_id;
  }
  
  if (!supplierId) {
    return 'Unknown Supplier';
  }
  
  // Find the supplier
  const supplier = suppliers.find(s => s.id === supplierId);
  return supplier?.name || 'Unknown Supplier';
}

/**
 * Check if bill can be edited based on its status
 */
export function canEditBill(bill: Bill): { canEdit: boolean; reason?: string } {
  if (bill.status === 'cancelled') {
    return { canEdit: false, reason: 'Cannot edit cancelled bill' };
  }
  
  if (bill.status === 'refunded') {
    return { canEdit: false, reason: 'Cannot edit refunded bill' };
  }
  
  return { canEdit: true };
}
