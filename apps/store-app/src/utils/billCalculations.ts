/**
 * Utility functions for computing bill totals dynamically
 * Since we no longer store subtotal, total_amount, and amount_due in the database,
 * these functions compute them on-the-fly from line items
 */

import { Bill, BillLineItem } from '../types';

export interface BillTotals {
  subtotal: number;
  total_amount: number;
  amount_due: number;
}

/**
 * Calculate bill totals from line items
 * @param lineItems - Array of bill line items
 * @param amountPaid - Amount already paid on the bill
 * @returns Computed totals
 */
export function calculateBillTotals(lineItems: BillLineItem[], amountPaid: number = 0): BillTotals {
  const subtotal = lineItems.reduce((sum, item) => sum + (item.line_total || 0), 0);
  const total_amount = subtotal; // Can add taxes/discounts here if needed
  const amount_due = Math.max(0, total_amount - amountPaid);

  return {
    subtotal,
    total_amount,
    amount_due,
  };
}

/**
 * Extended bill interface with computed totals
 */
export interface BillWithTotals extends Bill {
  subtotal: number;
  total_amount: number;
  amount_due: number;
  bill_line_items?: BillLineItem[];
}

/**
 * Add computed totals to a bill object
 * @param bill - Bill object
 * @param lineItems - Associated line items
 * @returns Bill with computed totals
 */
export function addComputedTotals(bill: Bill, lineItems: BillLineItem[]): BillWithTotals {
  const totals = calculateBillTotals(lineItems, bill.amount_paid);
  
  return {
    ...bill,
    ...totals,
    bill_line_items: lineItems,
  };
}

/**
 * Add computed totals to multiple bills
 * @param bills - Array of bills with their line items
 * @returns Bills with computed totals
 */
export function addComputedTotalsToMany(
  bills: Array<{ bill: Bill; lineItems: BillLineItem[] }>
): BillWithTotals[] {
  return bills.map(({ bill, lineItems }) => addComputedTotals(bill, lineItems));
}
