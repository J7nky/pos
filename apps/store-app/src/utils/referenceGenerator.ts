/**
 * Utility functions for generating short, readable reference IDs
 * for transactions, payments, and sales
 */

/**
 * Generates a short unique ID based on timestamp and random numbers
 * Format: 8-digit number (e.g., "12345678")
 */
function generateShortId(): string {
  const timestamp = Date.now();
  // Get last 5 digits of timestamp
  const timestampPart = (timestamp % 100000).toString().padStart(5, '0');
  // Generate 3 random digits
  const randomPart = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${timestampPart}${randomPart}`;
}

/**
 * Generates a short unique ID for bills
 * Format: 6-digit number (e.g., "123456")
 */
function generateBillShortId(): string {
  const timestamp = Date.now();
  // Get last 4 digits of timestamp
  const timestampPart = (timestamp % 10000).toString().padStart(4, '0');
  // Generate 2 random digits
  const randomPart = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  return `${timestampPart}${randomPart}`;
}

/**
 * Generates a payment reference ID
 * Format: "PAY-12345678" (8 digits)
 */
export function generatePaymentReference(): string {
  return `PAY-${generateShortId()}`;
}

/**
 * Generates a sale reference ID
 * Format: "SALE-12345678" (8 digits)
 */
export function generateSaleReference(): string {
  return `SALE-${generateShortId()}`;
}

/**
 * Generates a bill reference ID
 * Format: "BILL-123456" (6 digits, uppercase)
 */
export function generateBillReference(): string {
  return `BILL-${generateBillShortId()}`;
}

/**
 * Generates an expense reference ID
 * Format: "EXP-12345678" (8 digits)
 */
export function generateExpenseReference(): string {
  return `EXP-${generateShortId()}`;
}

/**
 * Generates a refund reference ID
 * Format: "REFUND-12345678" (8 digits)
 */
export function generateRefundReference(): string {
  return `REFUND-${generateShortId()}`;
}

/**
 * Generates an inventory reference ID
 * Format: "INV-12345678" (8 digits)
 */
export function generateInventoryReference(): string {
  return `INV-${generateShortId()}`;
}

/**
 * Generates a commission reference ID
 * Format: "COMM-12345678" (8 digits)
 */
export function generateCommissionReference(): string {
  return `COMM-${generateShortId()}`;
}

/**
 * Generates a porterage fee reference ID
 * Format: "PORT-12345678" (8 digits)
 */
export function generatePorterageReference(): string {
  return `PORT-${generateShortId()}`;
}

/**
 * Generates a transfer fee reference ID
 * Format: "TRANS-12345678" (8 digits)
 */
export function generateTransferReference(): string {
  return `TRANS-${generateShortId()}`;
}

/**
 * Generates an advance payment reference ID
 * Format: "ADV-12345678" (8 digits)
 */
export function generateAdvanceReference(): string {
  return `ADV-${generateShortId()}`;
}

/**
 * Generates a reversal reference ID
 * Format: "REV-12345678" (8 digits)
 */
export function generateReversalReference(): string {
  return `REV-${generateShortId()}`;
}

/**
 * Generates a credit reference ID
 * Format: "CREDIT-12345678" (8 digits)
 */
export function generateCreditReference(): string {
  return `CREDIT-${generateShortId()}`;
}

/**
 * Generates an accounts receivable reference ID
 * Format: "AR-12345678" (8 digits)
 */
export function generateARReference(): string {
  return `AR-${generateShortId()}`;
}

/**
 * Generates an accounts payable reference ID
 * Format: "AP-12345678" (8 digits)
 */
export function generateAPReference(): string {
  return `AP-${generateShortId()}`;
}

/**
 * Generates a transaction reference ID with custom prefix
 * Format: "{PREFIX}-12345678" (8 digits)
 */
export function generateReference(prefix: string): string {
  return `${prefix}-${generateShortId()}`;
}

